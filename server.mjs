import { createServer } from 'http';
import https from 'https';
import { parse } from 'url';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
};

// Read environment variables
const FMP_API_KEY = process.env.FMP_API_KEY || '4csJHhT1Qn74tSp6IZjrMGGAyk8jU3Qs';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd6u2f89r01qp1k9auq1gd6u2f89r01qp1k9auq20';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const INDIAN_API_KEY = process.env.INDIAN_API_KEY || 'sk-live-ykuBl3tx7N0UBnKIMzjcwWQdfoZZETSz0xS5Tkha';
const INDIAN_API_BASE = 'https://stock.indianapi.in';
const AV_API_KEY = process.env.AV_API_KEY || 'KY42CNVV87JF76K1';
const AV_API_BASE = 'https://www.alphavantage.co';

// ─── IndianAPI helpers ─────────────────────────────────────────────────────
const indianApiCache = new Map();
const INDIAN_API_TTL = 5 * 60 * 1000; // 5-min cache (500 req/month limit)

// ─── Alpha Vantage helpers ─────────────────────────────────────────────────
const avCache = new Map();
const AV_TTL = 15 * 60 * 1000; // 15-min cache (25 req/day free limit)

// ─── Field validation bounds ───────────────────────────────────────────────
// Values outside these ranges are almost certainly data errors → rejected
const FIELD_BOUNDS = {
  pe:            { min: 0,      max: 999   }, // negative P/E means loss (handled separately)
  eps:           { min: -9999,  max: 99999 },
  roe:           { min: -100,   max: 500   }, // some holding cos legitimate > 100
  roce:          { min: -100,   max: 200   },
  dividendYield: { min: 0,      max: 25    }, // > 25% = almost certainly basis-points error
  bookValue:     { min: 0.01,   max: 1e7   },
  debtEquity:    { min: 0,      max: 50    }, // negative debt ignored (net cash = 0 D/E)
  currentRatio:  { min: 0.01,   max: 50    },
  opmPercent:    { min: -100,   max: 100   },
  pb:            { min: 0.01,   max: 500   },
  evEbitda:      { min: 0,      max: 500   },
  beta:          { min: -5,     max: 10    },
  revenueCr:     { min: 0.01,   max: 5e7   },
  netProfitCr:   { min: -5e6,   max: 5e6   },
  marketCapCr:   { min: 0.01,   max: 5e7   },
};

// Validate + normalise a single field value. Returns number or null.
function validated(field, raw, source, logs) {
  if (raw === null || raw === undefined || raw === '' || raw === 'N/A') return null;
  const v = typeof raw === 'number' ? raw
    : parseFloat(String(raw).replace(/[,%\u20B9\s]/g, ''));
  if (!isFinite(v) || isNaN(v)) {
    logs.push(`SKIP  ${field}=${JSON.stringify(raw)} [${source}]: not a number`);
    return null;
  }
  const b = FIELD_BOUNDS[field];
  if (b && (v < b.min || v > b.max)) {
    logs.push(`REJECT ${field}=${v} [${source}]: out of bounds [${b.min}, ${b.max}]`);
    return null;
  }
  return Math.round(v * 1000) / 1000; // 3 decimal places
}

// First-wins: pick the first non-null validated value from ordered candidates
function firstValid(field, candidates, logs) {
  for (const { value, src } of candidates) {
    const v = validated(field, value, src, logs);
    if (v !== null) {
      logs.push(`USE   ${field}=${v} [${src}]`);
      return v;
    }
  }
  return null;
}

// ─── Centralized normalized stock cache (10-min TTL) ──────────────────────
const normalizedCache = new Map();
const NORMALIZED_TTL = 10 * 60 * 1000;

async function fetchIndianAPI(endpoint, params = {}) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const url = `${INDIAN_API_BASE}${endpoint}${qs ? '?' + qs : ''}`;
  const res = await httpsGet(url, {
    'x-api-key': INDIAN_API_KEY,
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }, 12000);
  if (res.status !== 200) throw new Error(`IndianAPI ${res.status}`);
  return JSON.parse(res.data);
}

async function fetchAlphaVantage(func, symbol, extra = {}) {
  const params = new URLSearchParams({
    function: func,
    symbol,
    apikey: AV_API_KEY,
    ...extra,
  });
  const url = `${AV_API_BASE}/query?${params}`;
  const res = await httpsGet(url, {
    'Accept': 'application/json',
    'User-Agent': 'FinStation/1.0',
  }, 15000);
  if (res.status !== 200) throw new Error(`AlphaVantage ${res.status}`);
  const data = JSON.parse(res.data);
  if (data['Note'] || data['Information']) throw new Error('AlphaVantage rate limit hit');
  return data;
}

// ─── Gift Nifty live data ──────────────────────────────────────────────────

let giftNiftyCache = null;
let giftNiftyCacheTime = 0;
const GIFT_NIFTY_TTL = 30 * 1000; // 30-second cache

// Source 0: Yahoo Finance — most reliable, uses existing crumb/cookie
async function fetchGiftNiftyFromYahooFinance() {
  try {
    const { crumb, cookie } = await getCrumb();
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EGIFTNIFTY&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent&crumb=${encodeURIComponent(crumb)}`;
    const res = await httpsGet(url, {
      ...JSON_HEADERS,
      ...(cookie ? { 'Cookie': cookie } : {}),
    }, 8000);
    if (res.status !== 200) return null;
    const data = JSON.parse(res.data);
    const q = data?.quoteResponse?.result?.[0];
    if (q && q.regularMarketPrice > 5000) {
      return {
        value: Math.round(q.regularMarketPrice * 100) / 100,
        change: Math.round((q.regularMarketChangePercent || 0) * 100) / 100,
        points: Math.round((q.regularMarketChange || 0) * 100) / 100,
        source: 'Yahoo',
      };
    }
  } catch (e) {
    console.log('Gift Nifty Yahoo error:', e.message);
  }
  return null;
}

// Source 1: MoneyControl price feed API
async function fetchGiftNiftyFromMoneyControl() {
  try {
    // Try MoneyControl price API
    const endpoints = [
      'https://priceapi.moneycontrol.com/pricefeed/nse_ifsc/C/%5EGIFTNIFTY',
      'https://priceapi.moneycontrol.com/pricefeed/nse_ifsc/D/%5EGIFTNIFTY',
    ];
    const mcHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.moneycontrol.com/',
      'Origin': 'https://www.moneycontrol.com',
    };
    for (const url of endpoints) {
      try {
        const res = await httpsGet(url, mcHeaders, 8000);
        if (res.status !== 200) continue;
        const data = JSON.parse(res.data);
        // MoneyControl price API response structure
        const d = data?.data || data;
        const rawPrice = d?.pricecurrent ?? d?.last ?? d?.close ?? d?.lastprice;
        const rawChange = d?.percentchange ?? d?.pricechangepercent ?? d?.pChange;
        const rawPoints = d?.pricechange ?? d?.change ?? d?.pointchange;
        const value = parseFloat(String(rawPrice || '').replace(/,/g, ''));
        if (value > 5000) {
          return {
            value,
            change: Math.round((parseFloat(rawChange || 0)) * 100) / 100,
            points: Math.round((parseFloat(rawPoints || 0)) * 100) / 100,
            source: 'MoneyControl',
          };
        }
      } catch {}
    }
    // Fallback: scrape MoneyControl global indices page
    const pageRes = await httpsGet(
      'https://www.moneycontrol.com/markets/global-indices/',
      { ...mcHeaders, 'Accept': 'text/html,application/xhtml+xml,*/*' },
      10000
    );
    const html = pageRes.data || '';
    // Look for GIFT Nifty price in the page
    const patterns = [
      /GIFT[^<]*?<[^>]+>[\s]*?([\d,]+\.?\d*)/i,
      /giftnifty[^<]*?([\d,]+\.?\d*)/i,
      /"GIFTNIFTY"[^}]*?"last"\s*:\s*"?([\d,\.]+)"?/i,
    ];
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) {
        const value = parseFloat(m[1].replace(/,/g, ''));
        if (value > 5000) return { value, change: 0, points: 0, source: 'MoneyControl' };
      }
    }
  } catch (e) {
    console.log('Gift Nifty MoneyControl error:', e.message);
  }
  return null;
}

// Source 2: NSE's live blob storage (no auth required)
async function fetchGiftNiftyFromNSEBlob() {
  try {
    const res = await httpsGet(
      'https://iislliveblob.niftyindices.com/jsonfiles/LiveIndices.json',
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, */*',
        'Referer': 'https://www.nseindia.com/',
        'Origin': 'https://www.nseindia.com',
      },
      8000,
    );
    const data = JSON.parse(res.data);
    const list = Array.isArray(data) ? data : (data.data || data.indices || []);
    const gift = list.find(i => {
      const name = (i.indexName || i.indexSymbol || i.name || '').toLowerCase();
      return name.includes('gift') || name.includes('giftnifty');
    });
    if (gift) {
      const value  = parseFloat(gift.last || gift.indexValue || gift.closePrice || 0);
      const change = parseFloat(gift.percentChange || gift.pChange || 0);
      const points = parseFloat(gift.change || gift.pointChange || 0);
      if (value > 5000) return { value, change, points, source: 'NSE' };
    }
  } catch (e) {
    console.log('Gift Nifty NSE blob error:', e.message);
  }
  return null;
}

// Source 2: NSE India allIndices API (cookie-gated but often works)
async function fetchGiftNiftyFromNSEApi() {
  try {
    const nseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.nseindia.com/',
      'X-Requested-With': 'XMLHttpRequest',
      'Connection': 'keep-alive',
    };
    // Get session cookies first
    const homeRes = await httpsGet('https://www.nseindia.com/', nseHeaders, 5000);
    const cookieStr = (homeRes.cookies || []).map(c => c.split(';')[0]).join('; ');
    if (!cookieStr) return null;

    const res = await httpsGet(
      'https://www.nseindia.com/api/allIndices',
      { ...nseHeaders, 'Cookie': cookieStr },
      8000,
    );
    const data = JSON.parse(res.data);
    const list = data.data || [];
    const gift = list.find(i => {
      const name = (i.indexSymbol || i.indexName || '').toLowerCase();
      return name.includes('gift') || name.includes('giftnifty');
    });
    if (gift) {
      const value  = parseFloat(gift.last || 0);
      const change = parseFloat(gift.percentChange || 0);
      const points = parseFloat(gift.change || 0);
      if (value > 5000) return { value, change, points, source: 'NSE' };
    }
  } catch (e) {
    console.log('Gift Nifty NSE API error:', e.message);
  }
  return null;
}

// Source 3: Google Finance HTML scrape (fallback)
async function fetchGiftNiftyFromGoogle() {
  try {
    const res = await httpsGet(
      'https://www.google.com/finance/quote/NIFTY_GIFTNIFTY:NSE',
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      10000,
    );
    const html = res.data;

    // Try JSON-LD structured data first
    const jsonLdBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || [];
    for (const block of jsonLdBlocks) {
      try {
        const content = block.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
        const json = JSON.parse(content);
        if (json.price) {
          const value  = parseFloat(String(json.price).replace(/,/g, ''));
          const pctRaw = String(json.percentChange || '0').replace(/[+%]/g, '');
          const change = parseFloat(pctRaw) || 0;
          if (value > 5000) return { value, change, points: 0, source: 'Google' };
        }
      } catch {}
    }

    // Fallback: look for embedded price patterns
    const patterns = [
      /data-last-normal="([\d,\.]+)"/,
      /"regularMarketPrice"\s*[,:]+"?([\d,\.]+)"?/,
      /class="YMlKec fxKbKc"[^>]*>([\d,\.]+)</,
      /"price"\s*:\s*"([\d,\.]+)"/,
    ];
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) {
        const value = parseFloat(m[1].replace(/,/g, ''));
        if (value > 5000) return { value, change: 0, points: 0, source: 'Google' };
      }
    }
  } catch (e) {
    console.log('Gift Nifty Google error:', e.message);
  }
  return null;
}

async function fetchGiftNiftyData() {
  const now = Date.now();
  if (giftNiftyCache && (now - giftNiftyCacheTime) < GIFT_NIFTY_TTL) {
    return { ...giftNiftyCache, cached: true };
  }

  // Try all sources: Yahoo → MoneyControl → NSE blob → Google → NSE API
  const yahooResult = await fetchGiftNiftyFromYahooFinance();
  if (yahooResult) {
    giftNiftyCache = yahooResult;
    giftNiftyCacheTime = now;
    return yahooResult;
  }

  const mcResult = await fetchGiftNiftyFromMoneyControl();
  if (mcResult) {
    giftNiftyCache = mcResult;
    giftNiftyCacheTime = now;
    return mcResult;
  }

  const [blobData, googleData] = await Promise.all([
    fetchGiftNiftyFromNSEBlob(),
    fetchGiftNiftyFromGoogle(),
  ]);

  const result = blobData || googleData;

  if (!result) {
    const nseData = await fetchGiftNiftyFromNSEApi();
    if (nseData) {
      giftNiftyCache = nseData;
      giftNiftyCacheTime = now;
      return nseData;
    }
    return null;
  }

  giftNiftyCache = result;
  giftNiftyCacheTime = now;
  return result;
}

// ─── Gift Nifty live snapshot via MoneyControl (primary, 10s cache) ───────────
const GIFT_NIFTY_API_URL = 'https://priceapi.moneycontrol.com/pricefeed/nseindia/futures/giftnifty';
const GIFT_NIFTY_TIMEOUT_MS = 7000;
const GIFT_NIFTY_CACHE_TTL_MS = 10000;
let giftNiftyLiveCache = null;
let giftNiftyLiveCacheAt = 0;

function parseGiftNiftyPayload(payload) {
  const raw = payload?.data || payload || {};
  const price = parseFloat(String(
    raw.pricecurrent ?? raw.lastprice ?? raw.last_price ?? raw.last ?? raw.close
  ).replace(/,/g, ''));
  const change = parseFloat(String(
    raw.pricechange ?? raw.change ?? raw.pointchange ?? 0
  ).replace(/,/g, ''));
  const percent = parseFloat(String(
    raw.percentchange ?? raw.pricechangepercent ?? raw.pChange ?? 0
  ).replace(/,/g, ''));
  if (!Number.isFinite(price) || price < 5000) return null;
  return {
    value:   Math.round(price   * 100) / 100,
    points:  Number.isFinite(change)  ? Math.round(change   * 100) / 100 : 0,
    change:  Number.isFinite(percent) ? Math.round(percent  * 100) / 100 : 0,
    source: 'MoneyControl',
    timestamp: new Date().toISOString(),
  };
}

async function fetchGiftNiftyLiveSnapshot() {
  const now = Date.now();
  if (giftNiftyLiveCache && (now - giftNiftyLiveCacheAt) < GIFT_NIFTY_CACHE_TTL_MS) {
    return giftNiftyLiveCache;
  }
  const mcHeaders = {
    ...JSON_HEADERS,
    'Referer': 'https://www.moneycontrol.com/',
    'Origin':  'https://www.moneycontrol.com',
  };
  try {
    const res = await httpsGet(GIFT_NIFTY_API_URL, mcHeaders, GIFT_NIFTY_TIMEOUT_MS);
    if (res.status !== 200) throw new Error(`MoneyControl ${res.status}`);
    const parsed = parseGiftNiftyPayload(JSON.parse(res.data || '{}'));
    if (!parsed) throw new Error('Invalid MoneyControl payload');
    giftNiftyLiveCache = parsed;
    giftNiftyLiveCacheAt = now;
    console.log(`[GiftNifty] MoneyControl ✓ ${parsed.value} (${parsed.change > 0 ? '+' : ''}${parsed.change}%)`);
    return parsed;
  } catch (e) {
    console.warn(`[GiftNifty] MoneyControl failed: ${e.message}`);
    if (giftNiftyLiveCache) return giftNiftyLiveCache; // serve stale on error
    return null;
  }
}

// ─── Screener.in helpers ───────────────────────────────────────────────────

// Simple in-memory cache for Screener data (5-min TTL)
const screenerCache = new Map();
const SCREENER_TTL = 10 * 60 * 1000; // 10-min cache to reduce Screener load

function stripTags(str) {
  return str.replace(/<[^>]+>/g, '').trim();
}

// Parse a number string: handles negatives, commas, % signs
function parseNum(str) {
  if (str == null) return null;
  const cleaned = String(str).replace(/[,%\s]/g, '').replace(/\s/g, '').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function parseScreenerData(html) {
  const result = {};

  // ── 1. Key Ratios ─────────────────────────────────────────────────────────
  const trIdx  = html.search(/id=["']top-ratios["']/);
  const crIdx  = html.search(/class=["'][^"']*company-ratios[^"']*["']/);
  // Extra fallback: find the first occurrence of "Stock P/E" text which is always in key ratios
  const peTextIdx = html.indexOf('Stock P/E');
  const ratiosSectionIdx = trIdx !== -1 ? trIdx
    : crIdx !== -1 ? crIdx
    : peTextIdx !== -1 ? Math.max(0, peTextIdx - 500)
    : -1;

  if (ratiosSectionIdx !== -1) {
    const chunk = html.slice(ratiosSectionIdx, ratiosSectionIdx + 10000);

    // Walk <li> blocks with PROPER nesting depth tracking so nested <ul><li>
    // inside a ratio item (popover/tooltip) doesn't truncate the block early.
    const liBlocks = [];
    let pos = 0;
    while (pos < chunk.length) {
      const start = chunk.indexOf('<li', pos);
      if (start === -1) break;
      // Skip past opening tag
      const tagEnd = chunk.indexOf('>', start);
      if (tagEnd === -1) break;

      let depth = 1;
      let sp = tagEnd + 1;
      let blockEnd = -1;
      while (sp < chunk.length && depth > 0) {
        const nextOpen  = chunk.indexOf('<li',  sp);
        const nextClose = chunk.indexOf('</li>', sp);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          const ot = chunk.indexOf('>', nextOpen);
          sp = ot !== -1 ? ot + 1 : nextOpen + 3;
        } else {
          depth--;
          sp = nextClose + 5;
          if (depth === 0) blockEnd = sp;
        }
      }
      if (blockEnd === -1) break;
      liBlocks.push(chunk.slice(start, blockEnd));
      pos = blockEnd;
    }

    for (const li of liBlocks) {
      // Name — try class="name", fall back to first non-empty text before numbers
      const nameMatch = li.match(/<span[^>]*class="[^"]*\bname\b[^"]*"[^>]*>([\s\S]*?)<\/span>/)
        || li.match(/<td[^>]*class="[^"]*\bname\b[^"]*"[^>]*>([\s\S]*?)<\/td>/);
      // Number — try class="number", then any bold/strong tag with numeric content
      const numMatch  = li.match(/<span[^>]*class="[^"]*\bnumber\b[^"]*"[^>]*>([-\d.,\s%]+)<\/span>/)
        || li.match(/<b[^>]*>([-\d.,]+)<\/b>/)
        || li.match(/<strong[^>]*>([-\d.,]+)<\/strong>/);
      if (!nameMatch || !numMatch) continue;

      const nameRaw = stripTags(nameMatch[1]).toLowerCase().trim();
      const name    = nameRaw.replace(/[^a-z0-9/]/g, ''); // strip non-alphanum for matching
      const value   = parseNum(numMatch[1]);
      if (value === null) continue;

      if      (nameRaw.includes('market cap'))                                                result.marketCapCr   = value;
      else if (nameRaw.includes('stock p/e') || name === 'pe' || name === 'stockpe')         result.pe            = value;
      else if (name === 'roe' || nameRaw.includes('return on equity'))                        result.roe           = value;
      else if (name === 'roce' || nameRaw.includes('return on capital'))                      result.roce          = value;
      else if (nameRaw.includes('dividend yield') || nameRaw.includes('div. yield') ||
               nameRaw.includes('div yield'))                                                 result.dividendYield = value;
      else if (nameRaw.includes('book value'))                                                result.bookValue     = value;
      else if (nameRaw.includes('current ratio'))                                             result.currentRatio  = value;
      else if (name === 'facevalue' || name === 'fv')                                         result.faceValue     = value;
      else if (name === 'eps' || nameRaw.includes('earning per share') ||
               nameRaw.includes('earnings per share'))                                        result.epsKR         = value;
      else if (name === 'rsi')                                                                result.rsi           = value;
    }
  }

  // ── 2. Balance Sheet (last non-empty cell = most recent year) ─────────────
  // Screener balance sheet rows: Share Capital, Reserves, Borrowings, Other Liabilities...
  const bsSearch = [html.indexOf('id="balance-sheet"'), html.indexOf("id='balance-sheet'")].find(i => i !== -1) ?? -1;
  if (bsSearch !== -1) {
    const bsChunk = html.slice(bsSearch, bsSearch + 30000);
    const rows = bsChunk.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
    for (const row of rows) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
        .map(m => stripTags(m[1]).replace(/,/g, '').trim());
      if (cells.length < 2) continue;
      const label  = cells[0].toLowerCase().replace(/[^a-z0-9]/g, ''); // strip all non-alphanum
      const recent = [...cells].reverse().find(c => c && !isNaN(parseFloat(c)) && parseFloat(c) !== 0);
      const val    = recent != null ? parseNum(recent) : null;
      if (val === null) continue;
      if      (label.includes('borrowing'))                                             result.totalBorrowings   = val;
      else if (label.includes('shareholder') || label.includes('networth') ||
               label === 'equity' || label.includes('shareholders'))                    result.shareholderEquity = val;
      // Screener uses "Reserves" row — accumulate for equity
      else if (label === 'reserves' || label === 'reservesandsurplus')                  result.reserves          = val;
      else if (label === 'sharecapital' || label === 'capital' || label === 'paidupcapital') result.shareCapital = val;
      else if (label.startsWith('cash') && !label.includes('flow'))                    result.cashAndEquivalents = val;
      else if (label.includes('currentratio'))                                         result.currentRatio      = val;
    }
    // If no explicit "Shareholders' Equity" row, sum Reserves + Share Capital
    if (result.shareholderEquity == null && result.reserves != null) {
      result.shareholderEquity = result.reserves + (result.shareCapital || 0);
    }
    if (result.totalBorrowings != null && result.shareholderEquity != null && result.shareholderEquity > 0) {
      result.debtEquity = Math.round((result.totalBorrowings / result.shareholderEquity) * 100) / 100;
    }
  }

  // ── 3. P&L Table ──────────────────────────────────────────────────────────
  const plSearch = [html.indexOf('id="profit-loss"'), html.indexOf("id='profit-loss'")].find(i => i !== -1) ?? -1;
  if (plSearch !== -1) {
    const plChunk = html.slice(plSearch, plSearch + 30000);

    // Detect TTM column: prefer explicit "TTM" header; otherwise use LAST column
    // (Screener shows years oldest→newest, latest/TTM is always the rightmost)
    let ttmColIdx = -1; // -1 = use last column
    const thead = plChunk.match(/<thead[\s\S]*?<\/thead>/);
    if (thead) {
      const ths = [...thead[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
        .map(m => stripTags(m[1]).toLowerCase().trim());
      const ti = ths.findIndex(h => h === 'ttm' || h === 'trailing' || h.includes('ttm'));
      if (ti > 0) ttmColIdx = ti;
    }

    const rows = plChunk.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
    for (const row of rows) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
        .map(m => stripTags(m[1]).replace(/,/g, '').trim());
      if (cells.length < 2) continue;
      // Strip ALL non-alphanum for robust matching
      const label = cells[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      // Use detected TTM index or fall back to last column (most recent)
      const ttm = ttmColIdx >= 0
        ? (cells[Math.min(ttmColIdx, cells.length - 1)] || cells[cells.length - 1])
        : cells[cells.length - 1];

      // Revenue: "Sales", "Revenue", "Revenue from Operations", "Net Revenue"
      if (!result.revenueCr &&
          (label.startsWith('sales') || label.startsWith('revenue') || label.startsWith('netrevenue') || label.startsWith('totalrevenue')) &&
          !label.includes('growth') && !label.includes('other')) {
        result.revenueCr = parseNum(ttm);

      // Net Profit: "Net Profit", "Profit After Tax", "Profit for the period", "PAT"
      } else if (!result.netProfitCr &&
          (label.includes('netprofit') || label.includes('profitaftertax') || label.includes('profitforthe') ||
           label === 'profit' || label === 'pat' || label.startsWith('netearning')) &&
          !label.includes('growth')) {
        result.netProfitCr = parseNum(ttm);

      // OPM: "OPM %", "Operating Profit Margin %", "EBITDA Margin %"
      } else if (label.startsWith('opm') || label.startsWith('operatingprofitmargin') || label.startsWith('ebitdamargin')) {
        result.opmPercent = parseNum(ttm.replace('%', ''));

      // EPS
      } else if (label === 'eps' || label.startsWith('eps')) {
        if (result.eps == null) result.eps = parseNum(ttm); // only set if not already set

      // D/E
      } else if (label.includes('debttoeq') || label === 'de' || label.includes('debteq') || label === 'debtoequity') {
        result.debtEquity = parseNum(ttm);
      }
    }
  }

  // Prefer P&L EPS (TTM); fall back to key-ratio EPS
  if (result.eps == null && result.epsKR != null) result.eps = result.epsKR;

  // If key-ratio P/E wasn't parsed, calculate from MarketCap / NetProfit(TTM)
  // This matches exactly how Screener computes "Stock P/E" (MCap-based, not price/EPS)
  if (result.pe == null && result.marketCapCr != null && result.netProfitCr != null && result.netProfitCr > 0) {
    result.pe = Math.round((result.marketCapCr / result.netProfitCr) * 10) / 10;
    console.log(`[Screener] Calculated P/E=${result.pe} from MCap/NetProfit (key-ratio parse failed)`);
  }

  // D/E fallback: calculate from balance sheet if not in P&L
  if (result.debtEquity == null && result.totalBorrowings != null && result.shareholderEquity != null && result.shareholderEquity > 0) {
    result.debtEquity = Math.round((result.totalBorrowings / result.shareholderEquity) * 100) / 100;
  }

  return result;
}

// ─── Yahoo Finance crumb cache ─────────────────────────────────────────────

// Cache crumb and cookies
let crumbCache = null;
let cookieCache = null;
let crumbFetchTime = 0;
const CRUMB_TTL = 25 * 60 * 1000; // 25 minutes

// Circuit breaker: if Yahoo Finance is unreachable, fail fast for 2 minutes
let crumbCircuitOpen = false;
let crumbCircuitOpenedAt = 0;
const CIRCUIT_RESET_MS = 2 * 60 * 1000; // 2 minutes

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity',
  'Connection': 'keep-alive',
};

const JSON_HEADERS = {
  ...BASE_HEADERS,
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
};

function httpsGet(url, headers, timeout = 15000) {
  const requestPromise = new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      const cookies = res.headers['set-cookie'] || [];
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ data, cookies, status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });

  // Race against a wall-clock timeout (catches DNS hangs that socket timeout misses)
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), timeout)
  );

  return Promise.race([requestPromise, timeoutPromise]);
}

async function getCrumb() {
  const now = Date.now();
  if (crumbCache && cookieCache && (now - crumbFetchTime) < CRUMB_TTL) {
    return { crumb: crumbCache, cookie: cookieCache };
  }

  // Circuit breaker: fail fast if Yahoo Finance was recently unreachable
  if (crumbCircuitOpen && (now - crumbCircuitOpenedAt) < CIRCUIT_RESET_MS) {
    throw new Error('Yahoo Finance unreachable (circuit open) — using mock data');
  }
  // Reset circuit after cooldown
  if (crumbCircuitOpen) {
    crumbCircuitOpen = false;
    console.log('🔄 Retrying Yahoo Finance...');
  }

  console.log('🔄 Fetching Yahoo Finance session...');

  // Try multiple consent/cookie endpoints (short 2s timeout to fail fast)
  const cookieEndpoints = [
    'https://fc.yahoo.com/',
    'https://finance.yahoo.com/',
  ];

  let cookieStr = '';
  for (const endpoint of cookieEndpoints) {
    try {
      const res = await httpsGet(endpoint, BASE_HEADERS, 2000);
      const cookies = res.cookies.map(c => c.split(';')[0]).join('; ');
      if (cookies.length > 10) {
        cookieStr = cookies;
        break;
      }
    } catch {
      continue;
    }
  }

  // Try multiple crumb endpoints (short 2s timeout to fail fast)
  const crumbEndpoints = [
    'https://query1.finance.yahoo.com/v1/test/getcrumb',
    'https://query2.finance.yahoo.com/v1/test/getcrumb',
  ];

  for (const endpoint of crumbEndpoints) {
    try {
      const crumbRes = await httpsGet(endpoint, {
        ...JSON_HEADERS,
        ...(cookieStr ? { 'Cookie': cookieStr } : {}),
      }, 2000);

      const crumb = crumbRes.data.trim();
      if (crumb && !crumb.includes('<') && !crumb.includes('{') && crumb.length >= 3) {
        crumbCache = crumb;
        cookieCache = cookieStr;
        crumbFetchTime = now;
        crumbCircuitOpen = false;
        console.log('✅ Yahoo Finance session ready');
        return { crumb, cookie: cookieStr };
      }
    } catch {
      continue;
    }
  }

  // Open circuit breaker so subsequent requests fail instantly
  crumbCircuitOpen = true;
  crumbCircuitOpenedAt = now;
  throw new Error('Could not get Yahoo Finance crumb — using mock data');
}

async function fetchYF(url) {
  const { crumb, cookie } = await getCrumb();
  const urlWithCrumb = `${url}&crumb=${encodeURIComponent(crumb)}`;

  const headers = {
    ...JSON_HEADERS,
    ...(cookie ? { 'Cookie': cookie } : {}),
  };

  let result = await httpsGet(urlWithCrumb, headers, 12000);

  // If auth failed, refresh crumb and retry once
  if (result.status === 401 || result.status === 403) {
    console.log('🔄 Crumb expired, refreshing...');
    crumbCache = null;
    cookieCache = null;
    const fresh = await getCrumb();
    const retryUrl = `${url}&crumb=${encodeURIComponent(fresh.crumb)}`;
    result = await httpsGet(retryUrl, {
      ...JSON_HEADERS,
      ...(fresh.cookie ? { 'Cookie': fresh.cookie } : {}),
    }, 12000);
  }

  if (result.status !== 200) {
    throw new Error(`Yahoo Finance returned status ${result.status}`);
  }

  try {
    return JSON.parse(result.data);
  } catch {
    console.error('Bad response (first 300 chars):', result.data.substring(0, 300));
    throw new Error('Yahoo Finance returned invalid JSON');
  }
}

// ─── FMP helper ────────────────────────────────────────────────────────────

async function fetchFMP(path, apiKey) {
  const url = `https://financialmodelingprep.com${path}`;
  const res = await httpsGet(url, {
    'Accept': 'application/json',
    'User-Agent': 'FinStation/1.0',
  }, 15000);
  if (res.status !== 200) {
    throw new Error(`FMP returned status ${res.status}`);
  }
  try {
    return JSON.parse(res.data);
  } catch {
    throw new Error('FMP returned invalid JSON');
  }
}

// ─── Finnhub helper ────────────────────────────────────────────────────────

async function fetchFinnhub(path, apiKey) {
  const url = `https://finnhub.io${path}`;
  const res = await httpsGet(url, {
    'Accept': 'application/json',
    'X-Finnhub-Token': apiKey,
    'User-Agent': 'FinStation/1.0',
  }, 15000);
  if (res.status !== 200) {
    throw new Error(`Finnhub returned status ${res.status}`);
  }
  try {
    return JSON.parse(res.data);
  } catch {
    throw new Error('Finnhub returned invalid JSON');
  }
}

// ─── Indian News RSS feeds ──────────────────────────────────────────────────

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const getTag = (tag) => {
      const m = itemXml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    const title = getTag('title')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'").replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '').trim();
    const linkMatch = itemXml.match(/<link[^>]*>([^<]+)<\/link>/) || itemXml.match(/<guid[^>]*>([^<]+)<\/guid>/);
    const link = linkMatch ? linkMatch[1].trim() : '';
    const pubDate = getTag('pubDate');
    const desc = getTag('description').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim().substring(0, 160);
    if (title && title.length > 10) items.push({ title, link, pubDate, description: desc });
  }
  return items;
}

function parseRSSDate(dateStr) {
  if (!dateStr) return 0;
  try { return new Date(dateStr).getTime(); } catch { return 0; }
}

function relativeTime(dateStr) {
  if (!dateStr) return 'Recent';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return 'Recent'; }
}

const INDIA_NEWS_FEEDS = [
  { url: 'https://economictimes.indiatimes.com/markets/rss.cms',        source: 'Economic Times',    category: 'Markets'  },
  { url: 'https://www.moneycontrol.com/rss/latestnews.xml',             source: 'Moneycontrol',      category: 'Markets'  },
  { url: 'https://feeds.feedburner.com/NdtvProfit-LatestNews',          source: 'NDTV Profit',       category: 'Business' },
  { url: 'https://www.livemint.com/rss/markets',                        source: 'LiveMint',          category: 'Markets'  },
  { url: 'https://www.business-standard.com/rss/markets-106.rss',       source: 'Business Standard', category: 'Markets'  },
  { url: 'https://www.thehindubusinessline.com/markets/?service=rss',   source: 'Hindu BusinessLine',category: 'Macro'    },
  { url: 'https://economictimes.indiatimes.com/industry/rss.cms',       source: 'Economic Times',    category: 'Industry' },
  { url: 'https://economictimes.indiatimes.com/news/company/corporate-trends/rssfeeds/2143429.cms', source: 'Economic Times', category: 'Corporate' },
  { url: 'https://www.moneycontrol.com/rss/results.xml',                source: 'Moneycontrol',      category: 'Results'  },
  { url: 'https://www.financialexpress.com/market/feed/',               source: 'Financial Express',  category: 'Markets'  },
];

// Google News RSS search — free, no API key, returns company-specific real articles
async function fetchGoogleNewsRSS(companyName, symbol) {
  const queries = [
    `${companyName} stock NSE`,
    `${companyName} NSE India`,
    symbol.replace(/\.(NS|BO)$/i, '') + ' NSE',
  ];
  const allItems = [];
  for (const q of queries.slice(0, 2)) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
      const res = await httpsGet(url, {
        'User-Agent': 'Mozilla/5.0 (compatible; FinStation/1.0)',
        'Accept': 'application/rss+xml, text/xml, */*',
      }, 12000);
      if (res.status !== 200) continue;
      const items = parseRSS(res.data);
      for (const item of items.slice(0, 10)) {
        // Google News links are redirect URLs — extract real URL from it
        const realLink = item.link?.includes('news.google.com') ? item.link : item.link;
        allItems.push({
          title: item.title,
          source: extractSourceFromTitle(item.title) || 'Google News',
          url: realLink || '#',
          time: relativeTime(item.pubDate),
          pubDate: item.pubDate,
          category: 'Company',
          summary: item.description || '',
        });
      }
    } catch (e) {
      // silent — try next query
    }
  }
  // Deduplicate titles
  const seen = new Set();
  return allItems.filter(item => {
    const k = item.title.toLowerCase().slice(0, 50);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 12);
}

function extractSourceFromTitle(title) {
  // Google News titles often end with " - Source Name"
  const m = title.match(/ - ([^-]{3,40})$/);
  if (m) return m[1].trim();
  return null;
}

function categoriseNews(title) {
  const t = (title || '').toLowerCase();
  if (/result|profit|revenue|earnings|quarterly|q[1-4]|fy2/.test(t))  return 'Results';
  if (/dividend|buyback|bonus|split|allotment/.test(t))               return 'Corporate Action';
  if (/acqui|merger|takeover|stake|deal|bid|mou|agreement/.test(t))   return 'M&A';
  if (/target|upgrade|downgrade|buy|sell|hold|analyst|rating|brokerage/.test(t)) return 'Analyst';
  if (/ipo|fpo|offer|fundrais|qip|ncd/.test(t))                       return 'Fundraising';
  if (/capex|expansion|plant|capacity|order|contract|win/.test(t))    return 'Business';
  if (/esg|sustainab|green|environment/.test(t))                      return 'ESG';
  if (/price|nse|bse|share|stock|market|sensex|nifty/.test(t))        return 'Markets';
  return 'Company';
}

// Filter general RSS items that mention the company name
function filterRSSByCompany(items, companyName) {
  const keywords = companyName.toLowerCase().split(' ')
    .filter(w => w.length > 3 && !['limited', 'private', 'india', 'corp', 'corporation', 'industries', 'enterprise'].includes(w));
  if (keywords.length === 0) return [];
  return items.filter(item => {
    const text = (item.title + ' ' + (item.summary || '')).toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });
}

let indiaNewsCache = null;
let indiaNewsFetchTime = 0;
const INDIA_NEWS_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchIndiaNewsFeed(feed) {
  try {
    const res = await httpsGet(feed.url, {
      'User-Agent': 'Mozilla/5.0 (compatible; FinStation/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    }, 10000);
    if (res.status !== 200) return [];
    const items = parseRSS(res.data);
    return items.slice(0, 5).map((item, i) => ({
      id: `${feed.source}-${i}-${Date.now()}`,
      title: item.title,
      source: feed.source,
      url: item.link || '#',
      time: relativeTime(item.pubDate),
      pubDate: item.pubDate,
      category: feed.category,
      summary: item.description || '',
    }));
  } catch (e) {
    console.error(`RSS fetch error [${feed.source}]:`, e.message);
    return [];
  }
}

// Convert NSE symbol (RELIANCE.NS) to Finnhub format (NSE:RELIANCE)
function toFinnhubSymbol(symbol) {
  if (symbol.includes(':')) return symbol; // already formatted
  const base = symbol.replace(/\.(NS|BO)$/i, '');
  return `NSE:${base}`;
}

// ─── Screener fetch helper (reused by /api/screener + /api/stock-normalized) ─
const SCREENER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.screener.in/',
};

async function fetchScreenerStock(cleanSymbol) {
  // Check cache first
  const cached = screenerCache.get(cleanSymbol);
  if (cached && (Date.now() - cached.time) < SCREENER_TTL) {
    return { data: cached.payload?.data || null, companyName: cached.payload?.companyName || null, fromCache: true };
  }

  // Step 1: autosuggest — try NSE symbol, then first 6 chars as fallback
  let companies = [];
  for (const query of [cleanSymbol, cleanSymbol.slice(0, 6)]) {
    try {
      const searchRes = await httpsGet(
        `https://www.screener.in/api/company/?q=${encodeURIComponent(query)}&autosuggest=1`,
        { ...SCREENER_HEADERS, 'Accept': 'application/json' },
        8000,
      );
      const parsed = JSON.parse(searchRes.data);
      if (Array.isArray(parsed) && parsed.length > 0) { companies = parsed; break; }
    } catch { continue; }
  }
  if (companies.length === 0) throw new Error('Not found on Screener.in');

  // Best match: URL slug equals NSE symbol; fallback to first result
  const company = companies.find(c =>
    c.url.replace(/\//g, '').toUpperCase() === `COMPANY${cleanSymbol}`
  ) || companies.find(c =>
    (c.name || '').toUpperCase().includes(cleanSymbol.slice(0, 5))
  ) || companies[0];

  // Step 2: fetch company page — try consolidated first, then standalone, with 1 retry each
  let html = '';
  for (const suffix of ['consolidated/', '']) {
    for (let attempt = 0; attempt < 2 && !html; attempt++) {
      try {
        const pageRes = await httpsGet(
          `https://www.screener.in${company.url}${suffix}`,
          SCREENER_HEADERS,
          attempt === 0 ? 18000 : 22000, // longer timeout on retry
        );
        if (pageRes.status === 200 && pageRes.data.length > 2000) {
          html = pageRes.data;
        } else if (pageRes.status === 403 || pageRes.status === 404) {
          break; // no point retrying 403/404
        }
      } catch (e) {
        console.warn(`[Screener] ${cleanSymbol} attempt ${attempt+1} (${suffix||'standalone'}): ${e.message}`);
        if (attempt === 0) await new Promise(r => setTimeout(r, 2000)); // 2s before retry
      }
    }
    if (html) break;
  }
  if (!html) throw new Error('Could not load Screener.in page after retries');

  const data = parseScreenerData(html);

  // Sanity log
  const fields = ['pe','roe','roce','revenueCr','netProfitCr','eps','bookValue','dividendYield'];
  const found = fields.filter(f => data[f] != null);
  console.log(`[Screener] ${cleanSymbol}: ${found.length}/${fields.length} fields → [${found.join(',')}]`);

  const payload = { success: true, data, companyName: company.name };
  screenerCache.set(cleanSymbol, { payload, time: Date.now() });
  return { data, companyName: company.name, fromCache: false };
}

// ─── IndianAPI normalizer (converts raw API response → standard fields) ─────
function normalizeIndianAPI(d) {
  if (!d) return null;
  const km = d.keyMetrics || {};
  const fin = d.financials || {};
  const cleanNum = (v) => v != null ? parseFloat(String(v).replace(/,/g, '')) : null;
  const divY = cleanNum(km.dividendYield);
  return {
    price:         cleanNum(d.currentPrice?.NSE || d.currentPrice?.BSE),
    high52w:       cleanNum(d.yearHigh),
    low52w:        cleanNum(d.yearLow),
    dayHigh:       cleanNum(d.intradayHigh),
    dayLow:        cleanNum(d.intradayLow),
    prevClose:     cleanNum(d.previousClose),
    volume:        d.volume ? parseInt(String(d.volume).replace(/,/g, '')) : null,
    open:          cleanNum(d.open),
    pe:            cleanNum(km.pe),
    pb:            cleanNum(km.pb),
    eps:           cleanNum(km.eps),
    roe:           cleanNum(km.roe),
    roce:          cleanNum(km.roce),
    dividendYield: divY != null ? (divY > 25 ? divY / 100 : divY) : null, // fix basis-points
    bookValue:     cleanNum(km.bookValue),
    marketCapCr:   km.marketCap ? Math.round(parseFloat(String(km.marketCap).replace(/,/g, '')) / 1e7) : null,
    revenueCr:     fin.revenue   ? Math.round(parseFloat(String(fin.revenue).replace(/,/g, ''))   / 1e7) : null,
    netProfitCr:   fin.netProfit ? Math.round(parseFloat(String(fin.netProfit).replace(/,/g, '')) / 1e7) : null,
    opmPercent:    cleanNum(fin.operatingMargin),
    companyProfile: d.companyProfile || null,
    industry:       d.industry || null,
    analystRating:  d.overallRating || null,
    analystReco:    d.analystRecommendation || null,
    shortTermTrend: d.shortTermTrend || null,
    longTermTrend:  d.longTermTrend || null,
  };
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const { pathname, query } = parse(req.url, true);

  try {
    // ─── Yahoo Finance endpoints ─────────────────────────────────────────

    if (pathname === '/api/quote') {
      const { symbols } = query;
      if (!symbols) throw new Error('symbols param required');
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,regularMarketPreviousClose,marketCap,trailingPE,priceToBook,dividendYield,beta,shortName,longName,fiftyTwoWeekHigh,fiftyTwoWeekLow,regularMarketDayHigh,regularMarketDayLow,regularMarketOpen,currency,exchange,epsTrailingTwelveMonths`;
      const data = await fetchYF(url);
      res.writeHead(200);
      res.end(JSON.stringify(data));

    } else if (pathname === '/api/chart') {
      const { symbol, range = '1y', interval = '1d' } = query;
      if (!symbol) throw new Error('symbol param required');
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div`;
      const data = await fetchYF(url);
      res.writeHead(200);
      res.end(JSON.stringify(data));

    } else if (pathname === '/api/search') {
      const { q } = query;
      if (!q) throw new Error('q param required');
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&lang=en-IN&region=IN`;
      const data = await fetchYF(url);
      res.writeHead(200);
      res.end(JSON.stringify(data));

    } else if (pathname === '/api/fundamentals') {
      const { symbol } = query;
      if (!symbol) throw new Error('symbol param required');
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,defaultKeyStatistics`;
      const data = await fetchYF(url);
      res.writeHead(200);
      res.end(JSON.stringify(data));

    } else if (pathname === '/api/yahoo-news') {
      // Yahoo Finance news for a symbol
      const { symbol } = query;
      if (!symbol) throw new Error('symbol param required');
      try {
        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=10&lang=en-IN&region=IN`;
        const data = await fetchYF(url);
        const newsItems = (data?.news || []).map((n, i) => ({
          id: n.uuid || i,
          title: n.title || '',
          source: n.publisher || 'Yahoo Finance',
          url: n.link || '#',
          time: n.providerPublishTime
            ? new Date(n.providerPublishTime * 1000).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
            : 'Recent',
          category: 'Markets',
          thumbnail: n.thumbnail?.resolutions?.[0]?.url || null,
        }));
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, news: newsItems }));
      } catch (e) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, error: e.message, news: [] }));
      }

    } else if (pathname === '/api/screener') {
      const { symbol } = query;
      if (!symbol) throw new Error('symbol param required');
      const cleanSymbol = symbol.replace(/\.(NS|BO)$/i, '').toUpperCase();
      try {
        const result = await fetchScreenerStock(cleanSymbol);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: result.data, companyName: result.companyName }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message, data: null }));
      }

    // ─── FMP endpoints ───────────────────────────────────────────────────

    } else if (pathname === '/api/fmp/ratios') {
      const { symbol, key } = query;
      if (!symbol) throw new Error('symbol param required');
      const apiKey = key || FMP_API_KEY;
      if (!apiKey) throw new Error('NO_FMP_KEY');
      try {
        // Convert NSE symbol to FMP format if needed
        const fmpSymbol = symbol.replace('.NS', '.NSE').replace('.BO', '.BSE');
        const data = await fetchFMP(`/api/v3/ratios/${encodeURIComponent(fmpSymbol)}?apikey=${encodeURIComponent(apiKey)}&limit=1`, apiKey);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data }));
      } catch (e) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }

    } else if (pathname === '/api/fmp/profile') {
      const { symbol, key } = query;
      if (!symbol) throw new Error('symbol param required');
      const apiKey = key || FMP_API_KEY;
      if (!apiKey) throw new Error('NO_FMP_KEY');
      try {
        const fmpSymbol = symbol.replace('.NS', '.NSE').replace('.BO', '.BSE');
        const data = await fetchFMP(`/api/v3/profile/${encodeURIComponent(fmpSymbol)}?apikey=${encodeURIComponent(apiKey)}`, apiKey);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data }));
      } catch (e) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }

    } else if (pathname === '/api/fmp/financials') {
      const { symbol, key } = query;
      if (!symbol) throw new Error('symbol param required');
      const apiKey = key || FMP_API_KEY;
      if (!apiKey) throw new Error('NO_FMP_KEY');
      try {
        const fmpSymbol = symbol.replace('.NS', '.NSE').replace('.BO', '.BSE');
        const encoded = encodeURIComponent(fmpSymbol);
        const [income, balance, cashflow] = await Promise.all([
          fetchFMP(`/api/v3/income-statement/${encoded}?apikey=${encodeURIComponent(apiKey)}&limit=4`, apiKey),
          fetchFMP(`/api/v3/balance-sheet-statement/${encoded}?apikey=${encodeURIComponent(apiKey)}&limit=4`, apiKey),
          fetchFMP(`/api/v3/cash-flow-statement/${encoded}?apikey=${encodeURIComponent(apiKey)}&limit=4`, apiKey),
        ]);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, income, balance, cashflow }));
      } catch (e) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }

    // ─── Finnhub endpoints ───────────────────────────────────────────────

    } else if (pathname === '/api/finnhub/news') {
      const { symbol, key } = query;
      if (!symbol) throw new Error('symbol param required');
      const apiKey = key || FINNHUB_API_KEY;
      if (!apiKey) throw new Error('NO_FINNHUB_KEY');
      try {
        const finnhubSym = toFinnhubSymbol(symbol);
        const toDate = new Date();
        const fromDate = new Date(toDate);
        fromDate.setDate(fromDate.getDate() - 30);
        const from = fromDate.toISOString().split('T')[0];
        const to = toDate.toISOString().split('T')[0];
        const data = await fetchFinnhub(
          `/api/v1/company-news?symbol=${encodeURIComponent(finnhubSym)}&from=${from}&to=${to}&token=${encodeURIComponent(apiKey)}`,
          apiKey
        );
        const news = (Array.isArray(data) ? data : []).slice(0, 20).map(n => ({
          id: n.id || Math.random(),
          title: n.headline || '',
          source: n.source || 'Finnhub',
          url: n.url || '#',
          time: n.datetime
            ? new Date(n.datetime * 1000).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
            : 'Recent',
          category: n.category || 'Markets',
          summary: n.summary || '',
        }));
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, news }));
      } catch (e) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, error: e.message, news: [] }));
      }

    } else if (pathname === '/api/finnhub/market-news') {
      const { key } = query;
      const apiKey = key || FINNHUB_API_KEY;
      if (!apiKey) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, error: 'NO_FINNHUB_KEY', news: [] }));
        return;
      }
      try {
        const data = await fetchFinnhub(
          `/api/v1/news?category=general&token=${encodeURIComponent(apiKey)}`,
          apiKey
        );
        const news = (Array.isArray(data) ? data : []).slice(0, 20).map(n => ({
          id: n.id || Math.random(),
          title: n.headline || '',
          source: n.source || 'Finnhub',
          url: n.url || '#',
          time: n.datetime
            ? new Date(n.datetime * 1000).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
            : 'Recent',
          category: n.category || 'Markets',
          summary: n.summary || '',
        }));
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, news }));
      } catch (e) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, error: e.message, news: [] }));
      }

    // ─── Combined news endpoints ─────────────────────────────────────────

    } else if (pathname === '/api/india-news') {
      // Serve cached results if still fresh
      if (indiaNewsCache && (Date.now() - indiaNewsFetchTime) < INDIA_NEWS_TTL) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, news: indiaNewsCache, cached: true }));
        return;
      }

      // Fetch all RSS feeds in parallel
      const results = await Promise.allSettled(INDIA_NEWS_FEEDS.map(fetchIndiaNewsFeed));
      const allNews = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

      // Sort newest first
      allNews.sort((a, b) => parseRSSDate(b.pubDate) - parseRSSDate(a.pubDate));

      // Deduplicate by title prefix
      const seen = new Set();
      const deduped = allNews.filter(item => {
        const key = item.title.substring(0, 50).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      indiaNewsCache = deduped.slice(0, 40);
      indiaNewsFetchTime = Date.now();

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, news: indiaNewsCache }));

    } else if (pathname === '/api/news/market') {
      const { finnhubKey } = query;
      const apiKey = finnhubKey || FINNHUB_API_KEY;
      let news = [];

      // Try Finnhub first
      if (apiKey) {
        try {
          const data = await fetchFinnhub(
            `/api/v1/news?category=general&token=${encodeURIComponent(apiKey)}`,
            apiKey
          );
          news = (Array.isArray(data) ? data : []).slice(0, 12).map(n => ({
            id: n.id || Math.random(),
            title: n.headline || '',
            source: n.source || 'Finnhub',
            url: n.url || '#',
            time: n.datetime
              ? new Date(n.datetime * 1000).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
              : 'Recent',
            category: n.category || 'Markets',
          }));
        } catch (e) {
          console.error('Finnhub market news error:', e.message);
        }
      }

      // Fallback: Yahoo Finance news for NSEI
      if (news.length === 0) {
        try {
          const url = `https://query1.finance.yahoo.com/v1/finance/search?q=%5ENSEI&quotesCount=0&newsCount=10&lang=en-IN&region=IN`;
          const data = await fetchYF(url);
          news = (data?.news || []).map((n, i) => ({
            id: n.uuid || i,
            title: n.title || '',
            source: n.publisher || 'Yahoo Finance',
            url: n.link || '#',
            time: n.providerPublishTime
              ? new Date(n.providerPublishTime * 1000).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
              : 'Recent',
            category: 'Markets',
          }));
        } catch (e) {
          console.error('Yahoo news fallback error:', e.message);
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, news }));

    } else if (pathname === '/api/news/company') {
      const { symbol, company, finnhubKey } = query;
      if (!symbol) throw new Error('symbol param required');
      const cleanSym = symbol.replace(/\.(NS|BO)$/i, '');
      const companyName = company || cleanSym;
      const apiKey = finnhubKey || FINNHUB_API_KEY;

      // ── Run ALL sources in parallel for speed ────────────────────────────
      const [finnhubResult, yahooResult, googleResult, bingResult, rssResult] =
        await Promise.allSettled([

          // 1. Finnhub company news
          (async () => {
            if (!apiKey) return [];
            const finnhubSym = toFinnhubSymbol(symbol);
            const toDate = new Date();
            const fromDate = new Date(toDate);
            fromDate.setDate(fromDate.getDate() - 30);
            const from = fromDate.toISOString().split('T')[0];
            const to   = toDate.toISOString().split('T')[0];
            const data = await fetchFinnhub(
              `/api/v1/company-news?symbol=${encodeURIComponent(finnhubSym)}&from=${from}&to=${to}&token=${encodeURIComponent(apiKey)}`,
              apiKey
            );
            return (Array.isArray(data) ? data : []).slice(0, 10).map(n => ({
              title:    n.headline || '',
              source:   n.source   || 'Finnhub',
              url:      n.url      || '#',
              time:     n.datetime ? relativeTime(new Date(n.datetime * 1000).toISOString()) : 'Recent',
              pubDate:  n.datetime ? new Date(n.datetime * 1000).toISOString() : '',
              category: categoriseNews(n.headline || ''),
              summary:  n.summary || '',
            })).filter(n => n.title.length > 10);
          })(),

          // 2. Yahoo Finance search news
          (async () => {
            const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(companyName)}&quotesCount=0&newsCount=10&lang=en-IN&region=IN`;
            const data = await fetchYF(url);
            return (data?.news || []).map(n => ({
              title:    n.title || '',
              source:   n.publisher || 'Yahoo Finance',
              url:      n.link || '#',
              time:     n.providerPublishTime ? relativeTime(new Date(n.providerPublishTime * 1000).toISOString()) : 'Recent',
              pubDate:  n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : '',
              category: categoriseNews(n.title || ''),
              summary:  '',
            })).filter(n => n.title.length > 10);
          })(),

          // 3. Google News RSS (free, no key, most reliable)
          fetchGoogleNewsRSS(companyName, symbol),

          // 4. Bing News RSS (free, no key)
          (async () => {
            const queries = [
              `${companyName} NSE stock`,
              `${cleanSym} share price India`,
            ];
            const all = [];
            for (const q of queries) {
              try {
                const url = `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss`;
                const res = await httpsGet(url, {
                  'User-Agent': 'Mozilla/5.0 (compatible; FinStation/1.0)',
                  'Accept': 'application/rss+xml, text/xml, */*',
                }, 10000);
                if (res.status !== 200) continue;
                const items = parseRSS(res.data);
                for (const item of items.slice(0, 8)) {
                  all.push({
                    title:    item.title,
                    source:   extractSourceFromTitle(item.title) || 'Bing News',
                    url:      item.link || '#',
                    time:     relativeTime(item.pubDate),
                    pubDate:  item.pubDate || '',
                    category: categoriseNews(item.title),
                    summary:  item.description || '',
                  });
                }
              } catch { /* silent */ }
            }
            return all;
          })(),

          // 5. Indian RSS feeds filtered by company name keywords
          (async () => {
            const results = await Promise.allSettled(INDIA_NEWS_FEEDS.map(fetchIndiaNewsFeed));
            const allRSS  = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
            return filterRSSByCompany(allRSS, companyName).map(n => ({
              ...n,
              category: categoriseNews(n.title),
            }));
          })(),
        ]);

      // Merge all results
      let news = [
        ...(finnhubResult.status === 'fulfilled' ? finnhubResult.value : []),
        ...(yahooResult.status   === 'fulfilled' ? yahooResult.value   : []),
        ...(googleResult.status  === 'fulfilled' ? googleResult.value  : []),
        ...(bingResult.status    === 'fulfilled' ? bingResult.value    : []),
        ...(rssResult.status     === 'fulfilled' ? rssResult.value     : []),
      ];

      // Deduplicate by title prefix + URL
      const seenT = new Set();
      const seenU = new Set();
      news = news.filter(item => {
        const tk = (item.title || '').toLowerCase().trim().slice(0, 55);
        const uk = item.url || '';
        if (!tk || tk.length < 10) return false;
        if (seenT.has(tk)) return false;
        if (uk && uk !== '#' && seenU.has(uk)) return false;
        seenT.add(tk);
        if (uk && uk !== '#') seenU.add(uk);
        return true;
      });

      // Sort newest first
      news.sort((a, b) => parseRSSDate(b.pubDate) - parseRSSDate(a.pubDate));

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, news: news.slice(0, 20) }));

    // ─── Anthropic research endpoint ─────────────────────────────────────

    } else if (pathname === '/api/stock-normalized') {
      // ── Single endpoint: fetches all sources, validates, returns clean data ──
      // Priority: Screener > IndianAPI > Alpha Vantage > Yahoo Finance
      const { symbol } = query;
      if (!symbol) throw new Error('symbol param required');

      const cleanSym = symbol.replace(/\.(NS|BO)$/i, '').toUpperCase();
      const nseSym   = cleanSym.endsWith('.NS') ? cleanSym : `${cleanSym}.NS`;
      const cacheKey = `norm_${cleanSym}`;
      const logs     = [];
      const t0       = Date.now();

      // Serve from 10-min cache if available
      const cachedNorm = normalizedCache.get(cacheKey);
      if (cachedNorm && (Date.now() - cachedNorm.t) < NORMALIZED_TTL) {
        logs.push(`CACHE HIT (${Math.round((Date.now() - cachedNorm.t) / 1000)}s old)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: cachedNorm.d, cached: true, logs }));
        return;
      }

      // ── Phase 1: Fetch Yahoo quote + Screener in parallel (always) ──────────
      const [yahooQ, yahooF, screenerResult] = await Promise.all([
        // Yahoo quote (price, beta, 52W, P/B, EV/EBITDA)
        (async () => {
          try {
            const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(nseSym)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,regularMarketPreviousClose,marketCap,trailingPE,priceToBook,dividendYield,beta,shortName,longName,fiftyTwoWeekHigh,fiftyTwoWeekLow,regularMarketDayHigh,regularMarketDayLow,regularMarketOpen,currency,exchange,epsTrailingTwelveMonths,industry`;
            const data = await fetchYF(url);
            return data?.quoteResponse?.result?.[0] || null;
          } catch (e) { logs.push(`WARN Yahoo quote: ${e.message}`); return null; }
        })(),
        // Yahoo fundamentals (D/E, current ratio, EV/EBITDA)
        (async () => {
          try {
            const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(nseSym)}?modules=financialData,defaultKeyStatistics`;
            const data = await fetchYF(url);
            const r = data?.quoteSummary?.result?.[0];
            if (!r) return null;
            const fd = r.financialData || {}, ks = r.defaultKeyStatistics || {};
            return {
              roe:          fd.returnOnEquity?.raw != null ? Math.round(fd.returnOnEquity.raw * 1000) / 10 : null,
              // Yahoo debtToEquity.raw is in percentage (50.37 = 50.37% = 0.5037 ratio) → divide by 100
              debtEquity:   fd.debtToEquity?.raw   != null ? Math.round(fd.debtToEquity.raw / 100 * 100) / 100 : null,
              currentRatio: fd.currentRatio?.raw   != null ? Math.round(fd.currentRatio.raw * 100)  / 100 : null,
              evEbitda:     ks.enterpriseToEbitda?.raw != null ? Math.round(ks.enterpriseToEbitda.raw * 10) / 10 : null,
              revenue:      Math.round((fd.totalRevenue?.raw || 0) / 1e5),   // → Cr*100 units
              netProfit:    Math.round((fd.netIncomeToCommon?.raw || 0) / 1e5),
            };
          } catch (e) { logs.push(`WARN Yahoo fundamentals: ${e.message}`); return null; }
        })(),
        // Screener (primary Indian fundamentals)
        (async () => {
          try {
            const result = await fetchScreenerStock(cleanSym);
            logs.push(`Screener: ${result.fromCache ? 'cache' : 'live'} → ${Object.keys(result.data || {}).join(', ') || 'empty'}`);
            return result.data || null;
          } catch (e) { logs.push(`WARN Screener: ${e.message}`); return null; }
        })(),
      ]);

      // ── Phase 2: Check if Screener is missing critical fields ──────────────
      const screenerCritical = ['revenueCr', 'netProfitCr', 'pe', 'roe', 'eps'];
      const screenerHas = screenerCritical.filter(f => screenerResult?.[f] != null).length;
      logs.push(`Screener coverage: ${screenerHas}/${screenerCritical.length} critical fields`);

      // Fetch fallbacks if Screener is incomplete (< 3 critical fields)
      // — covers newly listed, smaller, or parse-tricky stocks
      let iaRaw = null, avResult = null;
      if (screenerHas < 3) {
        logs.push(`FALLBACK: Screener insufficient → fetching IndianAPI + Alpha Vantage`);
        [iaRaw, avResult] = await Promise.all([
          (async () => {
            try {
              const name = cleanSym.replace(/\s+(limited|ltd|industries|corp)$/i, '').trim();
              const cacheKey = `iapi_${name.toLowerCase()}`;
              const cIA = indianApiCache.get(cacheKey);
              if (cIA && (Date.now() - cIA.t) < INDIAN_API_TTL) return cIA.d;
              const d = await fetchIndianAPI('/stock', { name });
              indianApiCache.set(cacheKey, { d, t: Date.now() });
              logs.push(`IndianAPI: fetched`);
              return d;
            } catch (e) { logs.push(`WARN IndianAPI: ${e.message}`); return null; }
          })(),
          (async () => {
            try {
              const avSym = `${cleanSym}.BSE`;
              const cKey = `av_ov_${cleanSym.toLowerCase()}`;
              const cAV = avCache.get(cKey);
              if (cAV && (Date.now() - cAV.t) < AV_TTL) return cAV.d;
              const raw = await fetchAlphaVantage('OVERVIEW', avSym);
              if (!raw.Symbol) throw new Error('No AV data');
              const safe = (v) => (v && v !== 'None' && v !== '-' ? v : null);
              const safeF = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
              const d = {
                pe: safeF(raw.PERatio), pb: safeF(raw.PriceToBookRatio), eps: safeF(raw.EPS),
                roe: raw.ReturnOnEquityTTM ? Math.round(safeF(raw.ReturnOnEquityTTM) * 1000) / 10 : null,
                dividendYield: raw.DividendYield ? Math.round(safeF(raw.DividendYield) * 10000) / 100 : null,
                bookValue: safeF(raw.BookValue),
                revenueCr: raw.RevenueTTM ? Math.round(parseFloat(raw.RevenueTTM) / 1e7) : null,
                netProfitCr: raw.NetIncomeTTM ? Math.round(parseFloat(raw.NetIncomeTTM) / 1e7) : null,
                opmPercent: raw.OperatingMarginTTM ? Math.round(safeF(raw.OperatingMarginTTM) * 1000) / 10 : null,
                high52w: safeF(raw['52WeekHigh']), low52w: safeF(raw['52WeekLow']),
                beta: safeF(raw.Beta), debtEquity: safeF(raw.DebtToEquityRatio),
                currentRatio: safeF(raw.CurrentRatio), evEbitda: safeF(raw.EVToEBITDA),
                marketCapCr: raw.MarketCapitalization ? Math.round(parseFloat(raw.MarketCapitalization) / 1e7) : null,
                name: safe(raw.Name), sector: safe(raw.Sector), description: safe(raw.Description),
              };
              avCache.set(cKey, { d, t: Date.now() });
              logs.push(`AlphaVantage: fetched`);
              return d;
            } catch (e) { logs.push(`WARN AlphaVantage: ${e.message}`); return null; }
          })(),
        ]);
      }

      const S  = screenerResult;           // Screener
      const IA = normalizeIndianAPI(iaRaw); // IndianAPI (normalized)
      const AV = avResult;                  // Alpha Vantage
      const Q  = yahooQ;                   // Yahoo quote
      const F  = yahooF;                   // Yahoo fundamentals

      // ── Phase 3: Merge with strict priority + validate all values ──────────
      const fv = (field, candidates) => firstValid(field, candidates, logs);

      // Price always from Yahoo (most real-time)
      const price     = Q?.regularMarketPrice || IA?.price || null;
      const marketCap = Q?.marketCap ? Math.round(Q.marketCap / 1e7) : null;
      const mkCapCr   = marketCap || S?.marketCapCr || AV?.marketCapCr || IA?.marketCapCr || null;

      // P/E: NEVER use Yahoo — their trailing P/E uses US-accounting EPS (wrong for India)
      // If key-ratio P/E is missing from Screener, compute from MarketCap / NetProfit (TTM)
      const screenerPE = S?.pe ?? (
        S?.marketCapCr != null && S?.netProfitCr != null && S.netProfitCr > 0
          ? Math.round(S.marketCapCr / S.netProfitCr * 10) / 10
          : null
      );
      const pe  = fv('pe',  [
        { value: screenerPE,  src: 'Screener'     },
        { value: IA?.pe,      src: 'IndianAPI'    },
        { value: AV?.pe,      src: 'AlphaVantage' },
        // Yahoo intentionally excluded — produces wrong P/E for Indian stocks
      ]);
      const eps = fv('eps', [
        { value: S?.eps,                      src: 'Screener'     },
        { value: IA?.eps,                     src: 'IndianAPI'    },
        { value: AV?.eps,                     src: 'AlphaVantage' },
        { value: Q?.epsTrailingTwelveMonths,  src: 'Yahoo'        },
      ]);
      const roe = fv('roe', [
        { value: S?.roe,         src: 'Screener'     },
        { value: IA?.roe,        src: 'IndianAPI'    },
        { value: AV?.roe,        src: 'AlphaVantage' },
        { value: F?.roe,         src: 'Yahoo'        },
      ]);
      const roce        = fv('roce',          [{ value: S?.roce,          src: 'Screener'  }, { value: IA?.roce,     src: 'IndianAPI'    }]);
      const opmPercent  = fv('opmPercent',    [{ value: S?.opmPercent,    src: 'Screener'  }, { value: IA?.opmPercent, src: 'IndianAPI'  }, { value: AV?.opmPercent, src: 'AlphaVantage' }]);
      const revenueCr   = fv('revenueCr',     [{ value: S?.revenueCr,     src: 'Screener'  }, { value: IA?.revenueCr,  src: 'IndianAPI'  }, { value: AV?.revenueCr,  src: 'AlphaVantage' }]);
      const netProfitCr = fv('netProfitCr',   [{ value: S?.netProfitCr,   src: 'Screener'  }, { value: IA?.netProfitCr,src: 'IndianAPI'  }, { value: AV?.netProfitCr,src: 'AlphaVantage' }]);
      const bookValue   = fv('bookValue',     [{ value: S?.bookValue,     src: 'Screener'  }, { value: IA?.bookValue,  src: 'IndianAPI'  }, { value: AV?.bookValue,  src: 'AlphaVantage' }]);
      const dividendYield = fv('dividendYield', [
        { value: S?.dividendYield,   src: 'Screener'     },
        { value: IA?.dividendYield,  src: 'IndianAPI'    },
        { value: AV?.dividendYield,  src: 'AlphaVantage' },
        { value: Q?.dividendYield != null ? Math.round(Q.dividendYield * 10000) / 100 : null, src: 'Yahoo' },
      ]);
      const debtEquity   = fv('debtEquity',   [{ value: S?.debtEquity,    src: 'Screener'  }, { value: AV?.debtEquity,   src: 'AlphaVantage' }, { value: F?.debtEquity,   src: 'Yahoo' }]);
      const currentRatio = fv('currentRatio', [{ value: S?.currentRatio, src: 'Screener' }, { value: AV?.currentRatio, src: 'AlphaVantage' }, { value: F?.currentRatio, src: 'Yahoo' }]);
      const evEbitda     = fv('evEbitda',     [{ value: F?.evEbitda,      src: 'Yahoo'     }, { value: AV?.evEbitda,    src: 'AlphaVantage' }]);
      const pb           = fv('pb',           [{ value: Q?.priceToBook,   src: 'Yahoo'     }, { value: IA?.pb,          src: 'IndianAPI'    }, { value: AV?.pb, src: 'AlphaVantage' }]);
      const beta         = fv('beta',         [{ value: Q?.beta,          src: 'Yahoo'     }, { value: AV?.beta,        src: 'AlphaVantage' }]);

      // P/E: use as-is from Screener/IndianAPI/AV — do NOT calculate from price/EPS
      // Calculating price/EPS produces wrong results (Yahoo EPS ≠ Indian accounting EPS)
      const peOut = pe;

      // P/B from price/bookValue only if no source has it
      let pbOut = pb;
      if (pbOut === null && price > 0 && bookValue != null && bookValue > 0) {
        pbOut = validated('pb', Math.round((price / bookValue) * 100) / 100, 'calculated', logs);
      }

      // Net Margin calculated
      const netMarginCalc = revenueCr != null && revenueCr > 0 && netProfitCr != null
        ? Math.round((netProfitCr / revenueCr) * 1000) / 10 : null;

      // ── Require at least price or core fundamentals ───────────────────────
      if (!price && peOut === null && revenueCr === null) {
        console.warn(`[STOCK-NORMALIZED] ${cleanSym}: no usable data from any source`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Data not available', data: null, logs }));
        return;
      }

      const data = {
        // Identity
        name:        Q?.longName  || Q?.shortName || AV?.name  || cleanSym,
        ticker:      Q?.symbol    || nseSym,
        sector:      Q?.industry  || AV?.sector   || IA?.industry  || null,
        exchange:    Q?.exchange === 'NSI' ? 'NSE' : (Q?.exchange || 'NSE'),
        description: IA?.companyProfile || AV?.description || null,
        // Price
        price:       price                          || null,
        change:      Q?.regularMarketChange         || null,
        changePct:   Q?.regularMarketChangePercent  || null,
        volume:      Q?.regularMarketVolume         || null,
        open:        Q?.regularMarketOpen           || null,
        prevClose:   Q?.regularMarketPreviousClose  || null,
        dayHigh:     Q?.regularMarketDayHigh        || IA?.dayHigh  || null,
        dayLow:      Q?.regularMarketDayLow         || IA?.dayLow   || null,
        high52w:     Q?.fiftyTwoWeekHigh            || IA?.high52w  || AV?.high52w  || null,
        low52w:      Q?.fiftyTwoWeekLow             || IA?.low52w   || AV?.low52w   || null,
        marketCapCr: mkCapCr,
        marketCap:   mkCapCr ? String(mkCapCr) : null,
        // Validated fundamentals (null = data not available — do NOT estimate)
        pe: peOut, pb: pbOut, eps, roe, roce, opmPercent,
        ebitdaMargin: opmPercent, // alias used by DCF/LBO
        dividendYield, bookValue, debtEquity, currentRatio, evEbitda, beta,
        revenueCr, netProfitCr,
        // Scaled for legacy consumers (revenue × 100 = internal unit)
        revenue:    revenueCr   != null ? revenueCr   * 100 : null,
        netProfit:  netProfitCr != null ? netProfitCr * 100 : null,
        netMargin:  netMarginCalc,
        // Balance sheet (only Screener provides these reliably)
        totalBorrowings:    S?.totalBorrowings    ?? null,
        cashAndEquivalents: S?.cashAndEquivalents ?? null,
        shareholderEquity:  S?.shareholderEquity  ?? null,
        // Analyst data (IndianAPI)
        analystRating:  IA?.analystRating  || null,
        analystReco:    IA?.analystReco    || null,
        shortTermTrend: IA?.shortTermTrend || null,
        longTermTrend:  IA?.longTermTrend  || null,
      };

      // Cache result
      normalizedCache.set(cacheKey, { d: data, t: Date.now() });
      if (normalizedCache.size > 200) {
        const oldest = [...normalizedCache.entries()].sort((a, b) => a[1].t - b[1].t)[0];
        normalizedCache.delete(oldest[0]);
      }

      const elapsed = Date.now() - t0;
      console.log(`[NORM] ${cleanSym} | Screener:${screenerHas}/${screenerCritical.length} | IA:${iaRaw?'✓':'—'} | AV:${avResult?'✓':'—'} | ${elapsed}ms`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data, logs }));

    } else if (pathname === '/api/alphavantage/overview') {
      // Alpha Vantage OVERVIEW — company fundamentals
      // symbol: NSE ticker e.g. RELIANCE.NS → tries RELIANCE.BSE then RELIANCE.NSE
      const { symbol } = query;
      if (!symbol) throw new Error('symbol param required');
      const base = symbol.replace(/\.(NS|BO|BSE|NSE)$/i, '');
      const avSymbol = `${base}.BSE`; // Alpha Vantage Indian format
      const cacheKey = `av_ov_${base.toLowerCase()}`;
      const cached = avCache.get(cacheKey);
      if (cached && (Date.now() - cached.t) < AV_TTL) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: cached.d, cached: true }));
        return;
      }
      try {
        const raw = await fetchAlphaVantage('OVERVIEW', avSymbol);
        if (!raw.Symbol) throw new Error('No data for symbol');
        // Normalise to standard format
        const safe = (v) => (v && v !== 'None' && v !== '-' ? v : null);
        const safeF = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
        const data = {
          symbol:        safe(raw.Symbol),
          name:          safe(raw.Name),
          sector:        safe(raw.Sector),
          industry:      safe(raw.Industry),
          description:   safe(raw.Description),
          marketCapCr:   raw.MarketCapitalization ? Math.round(parseFloat(raw.MarketCapitalization) / 10000000) : null,
          pe:            safeF(raw.PERatio),
          pb:            safeF(raw.PriceToBookRatio),
          eps:           safeF(raw.EPS),
          // ROE from AV is decimal (0.12 = 12%)
          roe:           raw.ReturnOnEquityTTM ? Math.round(safeF(raw.ReturnOnEquityTTM) * 1000) / 10 : null,
          // Div Yield from AV is decimal (0.02 = 2%)
          dividendYield: raw.DividendYield ? Math.round(safeF(raw.DividendYield) * 10000) / 100 : null,
          bookValue:     safeF(raw.BookValue),
          // Revenue/NetIncome in absolute ₹ → convert to Cr
          revenueCr:     raw.RevenueTTM ? Math.round(parseFloat(raw.RevenueTTM) / 10000000) : null,
          netProfitCr:   raw.NetIncomeTTM ? Math.round(parseFloat(raw.NetIncomeTTM) / 10000000) : null,
          // OPM from AV is decimal (0.18 = 18%)
          opmPercent:    raw.OperatingMarginTTM ? Math.round(safeF(raw.OperatingMarginTTM) * 1000) / 10 : null,
          high52w:       safeF(raw['52WeekHigh']),
          low52w:        safeF(raw['52WeekLow']),
          beta:          safeF(raw.Beta),
          debtEquity:    safeF(raw.DebtToEquityRatio),
          currentRatio:  safeF(raw.CurrentRatio),
          evEbitda:      safeF(raw.EVToEBITDA),
        };
        avCache.set(cacheKey, { d: data, t: Date.now() });
        if (avCache.size > 200) {
          const oldest = [...avCache.entries()].sort((a, b) => a[1].t - b[1].t)[0];
          avCache.delete(oldest[0]);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message, data: null }));
      }

    } else if (pathname === '/api/alphavantage/quote') {
      // Alpha Vantage GLOBAL_QUOTE — real-time price
      const { symbol } = query;
      if (!symbol) throw new Error('symbol param required');
      const base = symbol.replace(/\.(NS|BO|BSE|NSE)$/i, '');
      const avSymbol = `${base}.BSE`;
      const cacheKey = `av_q_${base.toLowerCase()}`;
      const cached = avCache.get(cacheKey);
      if (cached && (Date.now() - cached.t) < 60000) { // 1-min cache for quotes
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: cached.d, cached: true }));
        return;
      }
      try {
        const raw = await fetchAlphaVantage('GLOBAL_QUOTE', avSymbol);
        const q = raw['Global Quote'] || {};
        const data = {
          price:     parseFloat(q['05. price']) || null,
          open:      parseFloat(q['02. open']) || null,
          high:      parseFloat(q['03. high']) || null,
          low:       parseFloat(q['04. low']) || null,
          prevClose: parseFloat(q['08. previous close']) || null,
          change:    parseFloat(q['09. change']) || null,
          changePct: parseFloat((q['10. change percent'] || '0').replace('%', '')) || null,
          volume:    parseInt(q['06. volume']) || null,
        };
        if (!data.price) throw new Error('No quote data');
        avCache.set(cacheKey, { d: data, t: Date.now() });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message, data: null }));
      }

    } else if (pathname === '/api/indianapi/stock') {
      const { name } = query;
      if (!name) throw new Error('name param required');
      const cacheKey = `iapi_${name.toLowerCase().trim()}`;
      const cached = indianApiCache.get(cacheKey);
      if (cached && (Date.now() - cached.t) < INDIAN_API_TTL) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: cached.d, cached: true }));
        return;
      }
      try {
        const data = await fetchIndianAPI('/stock', { name });
        indianApiCache.set(cacheKey, { d: data, t: Date.now() });
        // Evict old entries
        if (indianApiCache.size > 100) {
          const oldest = [...indianApiCache.entries()].sort((a, b) => a[1].t - b[1].t)[0];
          indianApiCache.delete(oldest[0]);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message, data: null }));
      }

    } else if (pathname === '/api/indianapi/trending') {
      const cacheKey = 'iapi_trending';
      const cached = indianApiCache.get(cacheKey);
      if (cached && (Date.now() - cached.t) < 60000) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: cached.d, cached: true }));
        return;
      }
      try {
        const data = await fetchIndianAPI('/trending');
        indianApiCache.set(cacheKey, { d: data, t: Date.now() });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message, data: null }));
      }

    } else if (pathname === '/api/gift-nifty') {
      // Primary: MoneyControl direct feed (most reliable, 10s cache)
      // Fallback: multi-source scraper (Yahoo / NSE blob / Google)
      let data = await fetchGiftNiftyLiveSnapshot();
      if (!data) data = await fetchGiftNiftyData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: !!data, data: data || null }));

    } else if (pathname === '/api/research') {
      // Proxy Anthropic API calls server-side
      let body = '';
      await new Promise((resolve) => {
        req.on('data', (chunk) => (body += chunk));
        req.on('end', resolve);
      });
      const { prompt, apiKey, model = 'claude-sonnet-4-5', maxTokens = 1600 } = JSON.parse(body || '{}');
      if (!prompt) throw new Error('prompt required');
      const key = apiKey || ANTHROPIC_API_KEY || '';
      if (!key) throw new Error('NO_API_KEY');

      const anthropicBody = JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const anthropicRes = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(anthropicBody),
          },
        };
        const request = https.request(options, (response) => {
          let data = '';
          response.on('data', (chunk) => (data += chunk));
          response.on('end', () => resolve({ data, status: response.statusCode }));
        });
        request.on('error', reject);
        request.setTimeout(30000, () => { request.destroy(); reject(new Error('Timeout')); });
        request.write(anthropicBody);
        request.end();
      });

      if (anthropicRes.status !== 200) {
        const errData = JSON.parse(anthropicRes.data || '{}');
        throw new Error(errData?.error?.message || `API error ${anthropicRes.status}`);
      }
      res.writeHead(200);
      res.end(anthropicRes.data);

    } else {
      // ─── Serve static files from dist/ (production build) ─────────────
      const distDir = join(__dirname, 'dist');
      if (existsSync(distDir)) {
        res.removeHeader('Content-Type'); // will be set per file
        let filePath = join(distDir, pathname === '/' ? 'index.html' : pathname);
        // SPA fallback — serve index.html for unknown routes
        if (!existsSync(filePath) || !extname(filePath)) {
          filePath = join(distDir, 'index.html');
        }
        try {
          const content = readFileSync(filePath);
          const mime = MIME_TYPES[extname(filePath)] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mime });
          res.end(content);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      }
    }
  } catch (e) {
    console.error('API Error:', e.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n✅ FinStation API Server running on http://localhost:${PORT}`);
  console.log('\n   API Stack:');
  console.log('   [1] Yahoo Finance   → Real-time price, charts, search, P/B, Beta, EV/EBITDA');
  console.log('   [2] Screener.in     → TTM financials (P/E, ROE, ROCE, EPS, Revenue, OPM, D/E, Book Value)');
  console.log('   [3] IndianAPI       → Fundamentals + analyst ratings (500 req/month)');
  console.log('   [4] Alpha Vantage   → P/E, EPS, ROE, Revenue, Margins, D/E, Current Ratio (25 req/day)');
  console.log('   [5] FMP             → Detailed statements & ratios fallback');
  console.log('   [6] Finnhub         → Company & market news');
  console.log('   [7] Anthropic       → AI research reports');
  console.log('   [8] NSE/Gift Nifty  → Live Gift Nifty futures\n');
  if (FMP_API_KEY) console.log('   ✓ FMP API key loaded');
  if (FINNHUB_API_KEY) console.log('   ✓ Finnhub API key loaded');
  if (ANTHROPIC_API_KEY) console.log('   ✓ Anthropic API key loaded');
  if (INDIAN_API_KEY) console.log('   ✓ IndianAPI key loaded');
  if (AV_API_KEY) console.log('   ✓ Alpha Vantage key loaded');
});
