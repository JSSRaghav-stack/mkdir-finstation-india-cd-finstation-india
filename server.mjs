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

// ─── IndianAPI helpers ─────────────────────────────────────────────────────
const indianApiCache = new Map();
const INDIAN_API_TTL = 90 * 1000; // 90s cache (500 req/month limit)

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

// ─── Gift Nifty live data ──────────────────────────────────────────────────

let giftNiftyCache = null;
let giftNiftyCacheTime = 0;
const GIFT_NIFTY_TTL = 30 * 1000; // 30-second cache

// Source 1: NSE's live blob storage (no auth required)
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

  // Try all sources in parallel; use first successful result
  const [blobData, googleData] = await Promise.all([
    fetchGiftNiftyFromNSEBlob(),
    fetchGiftNiftyFromGoogle(),
  ]);

  // NSE blob preferred; Google as fallback
  const result = blobData || googleData;

  // If live scraping fails, try the cookie-gated NSE API as last resort
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

// ─── Screener.in helpers ───────────────────────────────────────────────────

// Simple in-memory cache for Screener data (5-min TTL)
const screenerCache = new Map();
const SCREENER_TTL = 5 * 60 * 1000;

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
  const ratiosSectionIdx = trIdx !== -1 ? trIdx : crIdx;

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

      const name  = stripTags(nameMatch[1]).toLowerCase().replace(/\s+/g, ' ').trim();
      const value = parseNum(numMatch[1]);
      if (value === null) continue;

      if      (name.includes('market cap'))                                     result.marketCapCr   = value;
      else if (name.includes('stock p/e') || name === 'p/e' || name === 'pe')  result.pe            = value;
      else if (name === 'roe' || name.includes('return on equity'))             result.roe           = value;
      else if (name === 'roce' || name.includes('return on capital'))           result.roce          = value;
      else if (name.includes('dividend yield') || name.includes('div. yield')) result.dividendYield = value;
      else if (name.includes('book value'))                                     result.bookValue     = value;
      else if (name === 'face value' || name === 'fv')                         result.faceValue     = value;
      else if (name === 'eps' || name.includes('earning per share'))            result.epsKR         = value;
      else if (name === 'rsi')                                                  result.rsi           = value;
    }
  }

  // ── 2. Balance Sheet (last non-empty cell = most recent year) ─────────────
  const bsIdx = html.indexOf('id="balance-sheet"');
  if (bsIdx !== -1) {
    const bsChunk = html.slice(bsIdx, bsIdx + 25000);
    const rows = bsChunk.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
    for (const row of rows) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
        .map(m => stripTags(m[1]).replace(/,/g, '').trim());
      if (cells.length < 2) continue;
      const label  = cells[0].toLowerCase().replace(/\s+/g, '');
      const recent = [...cells].reverse().find(c => c && !isNaN(parseFloat(c)) && parseFloat(c) !== 0);
      const val    = recent != null ? parseNum(recent) : null;
      if (val === null) continue;
      if      (label.includes('borrowing'))                                     result.totalBorrowings   = val;
      else if (label.includes('shareholder') || label.includes('networth') ||
               label === 'equity' || label.includes('shareholders'))            result.shareholderEquity = val;
      else if (label.includes('cashandcash') || label.includes('cash&') ||
               label === 'cashandequivalents')                                  result.cashAndEquivalents = val;
    }
    if (result.totalBorrowings != null && result.shareholderEquity != null && result.shareholderEquity > 0) {
      result.debtEquity = Math.round((result.totalBorrowings / result.shareholderEquity) * 100) / 100;
    }
  }

  // ── 3. P&L Table ──────────────────────────────────────────────────────────
  const plIdx = html.indexOf('id="profit-loss"');
  if (plIdx !== -1) {
    const plChunk = html.slice(plIdx, plIdx + 30000);

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
      const label = cells[0].toLowerCase().replace(/\s+/g, '');
      // Use detected TTM index or fall back to last column (most recent)
      const ttm = ttmColIdx >= 0
        ? (cells[Math.min(ttmColIdx, cells.length - 1)] || cells[cells.length - 1])
        : cells[cells.length - 1];

      if ((label.startsWith('sales') || label === 'revenue') && !label.includes('other') && !label.includes('growth')) {
        result.revenueCr   = parseNum(ttm);
      } else if ((label.includes('netprofit') || label.includes('profitaftertax') || label === 'profit') && !label.includes('growth')) {
        result.netProfitCr = parseNum(ttm);
      } else if (label.startsWith('opm') || label.startsWith('operatingprofit%')) {
        result.opmPercent  = parseNum(ttm.replace('%', ''));
      } else if (label === 'eps' || label.startsWith('eps(')) {
        result.eps         = parseNum(ttm);
      } else if (label.includes('debttoeq') || label === 'd/e' || label.includes('debteq')) {
        result.debtEquity  = parseNum(ttm);
      }
    }
  }

  // Prefer P&L EPS (TTM); fall back to key-ratio EPS
  if (result.eps == null && result.epsKR != null) result.eps = result.epsKR;

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

      // Serve from cache if fresh
      const cached = screenerCache.get(cleanSymbol);
      if (cached && (Date.now() - cached.time) < SCREENER_TTL) {
        res.writeHead(200);
        res.end(JSON.stringify(cached.payload));
        return;
      }

      const SCREENER_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.screener.in/',
      };

      // Step 1 – find company slug via Screener autosuggest
      const searchRes = await httpsGet(
        `https://www.screener.in/api/company/?q=${encodeURIComponent(cleanSymbol)}&autosuggest=1`,
        { ...SCREENER_HEADERS, 'Accept': 'application/json' },
        8000,
      );
      let companies;
      try { companies = JSON.parse(searchRes.data); } catch { companies = []; }
      if (!companies || companies.length === 0) throw new Error('Not found on Screener.in');

      // Best match: URL path exactly matches the symbol
      const company = companies.find(c =>
        c.url.replace(/\//g, '').toUpperCase() === `COMPANY${cleanSymbol}`
      ) || companies[0];

      // Step 2 – fetch company page (consolidated preferred, standalone fallback)
      let html = '';
      for (const suffix of ['consolidated/', '']) {
        try {
          const pageRes = await httpsGet(
            `https://www.screener.in${company.url}${suffix}`,
            SCREENER_HEADERS,
            18000,
          );
          if (pageRes.status === 200 && pageRes.data.length > 2000) {
            html = pageRes.data;
            break;
          }
        } catch { continue; }
      }
      if (!html) throw new Error('Could not load Screener.in page');

      const data = parseScreenerData(html);
      const payload = { success: true, data, companyName: company.name };
      screenerCache.set(cleanSymbol, { payload, time: Date.now() });

      res.writeHead(200);
      res.end(JSON.stringify(payload));

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
      const data = await fetchGiftNiftyData();
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
  console.log(`\n✅ FinStation Proxy Server running on http://localhost:${PORT}`);
  console.log('   Market data  → Yahoo Finance (NSE/BSE)');
  console.log('   Fundamentals → Yahoo Finance quoteSummary + Screener.in');
  console.log('   Ratios       → Financial Modeling Prep (FMP)');
  console.log('   News         → Finnhub + Yahoo Finance + Indian RSS (ET, MC, NDTV, Mint, BS)');
  console.log('   15-20 min delayed market data — FREE\n');
  if (FMP_API_KEY) console.log('   ✓ FMP API key loaded from environment');
  if (FINNHUB_API_KEY) console.log('   ✓ Finnhub API key loaded from environment');
  if (ANTHROPIC_API_KEY) console.log('   ✓ Anthropic API key loaded from environment');
});
