import { createServer } from 'http';
import https from 'https';
import { parse } from 'url';

const PORT = 3001;

// ─── Screener.in helpers ───────────────────────────────────────────────────

// Simple in-memory cache for Screener data (5-min TTL)
const screenerCache = new Map();
const SCREENER_TTL = 5 * 60 * 1000;

function stripTags(str) {
  return str.replace(/<[^>]+>/g, '').trim();
}

function parseScreenerData(html) {
  const result = {};

  // 1. Key ratios — Screener uses id="top-ratios" or class="company-ratios"
  const ratiosMatch = html.match(/(?:id="top-ratios"|class="company-ratios")[^>]*>([\s\S]*?)<\/ul>/);
  if (ratiosMatch) {
    const liItems = ratiosMatch[1].match(/<li[\s\S]*?<\/li>/g) || [];
    for (const li of liItems) {
      const nameEl = li.match(/<span[^>]*class="name"[^>]*>([\s\S]*?)<\/span>/);
      const numEl  = li.match(/<span[^>]*class="number"[^>]*>([\d.,]+)<\/span>/);
      if (!nameEl || !numEl) continue;
      const name  = stripTags(nameEl[1]).toLowerCase().trim();
      const value = parseFloat(numEl[1].replace(/,/g, ''));
      if (isNaN(value)) continue;
      if (name.includes('market cap'))               result.marketCapCr    = value;
      else if (name.includes('stock p/e') || name === 'p/e') result.pe = value;
      else if (name === 'roe')                        result.roe            = value;
      else if (name === 'roce')                       result.roce           = value;
      else if (name.includes('dividend yield'))       result.dividendYield  = value;
      else if (name.includes('book value'))           result.bookValue      = value;
    }
  }

  // 2. P&L table — TTM column (last td per row)
  const plIdx = html.indexOf('id="profit-loss"');
  if (plIdx !== -1) {
    const plChunk = html.slice(plIdx, plIdx + 25000);
    const tableMatch = plChunk.match(/<table[^>]*>([\s\S]*?)<\/table>/);
    if (tableMatch) {
      const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
          .map(m => stripTags(m[1]).replace(/,/g, '').trim());
        if (cells.length < 2) continue;
        const label = cells[0].toLowerCase().replace(/\s+/g, '');
        const ttm   = cells[cells.length - 1];
        if ((label.startsWith('sales') || label === 'revenue') && !label.includes('other')) {
          result.revenueCr   = parseFloat(ttm) || null;
        } else if (label.includes('netprofit')) {
          result.netProfitCr = parseFloat(ttm) || null;
        } else if (label.startsWith('opm')) {
          result.opmPercent  = parseFloat(ttm.replace('%', '')) || null;
        }
      }
    }
  }

  return result;
}

// ─── Yahoo Finance crumb cache ─────────────────────────────────────────────

// Cache crumb and cookies
let crumbCache = null;
let cookieCache = null;
let crumbFetchTime = 0;
const CRUMB_TTL = 25 * 60 * 1000; // 25 minutes

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
  return new Promise((resolve, reject) => {
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
}

async function getCrumb() {
  const now = Date.now();
  if (crumbCache && cookieCache && (now - crumbFetchTime) < CRUMB_TTL) {
    return { crumb: crumbCache, cookie: cookieCache };
  }

  console.log('🔄 Fetching Yahoo Finance session...');

  // Try multiple consent/cookie endpoints
  const cookieEndpoints = [
    'https://fc.yahoo.com/',
    'https://finance.yahoo.com/',
  ];

  let cookieStr = '';
  for (const endpoint of cookieEndpoints) {
    try {
      const res = await httpsGet(endpoint, BASE_HEADERS, 10000);
      const cookies = res.cookies.map(c => c.split(';')[0]).join('; ');
      if (cookies.length > 10) {
        cookieStr = cookies;
        break;
      }
    } catch {
      continue;
    }
  }

  // Try multiple crumb endpoints
  const crumbEndpoints = [
    'https://query1.finance.yahoo.com/v1/test/getcrumb',
    'https://query2.finance.yahoo.com/v1/test/getcrumb',
  ];

  for (const endpoint of crumbEndpoints) {
    try {
      const crumbRes = await httpsGet(endpoint, {
        ...JSON_HEADERS,
        ...(cookieStr ? { 'Cookie': cookieStr } : {}),
      }, 10000);

      const crumb = crumbRes.data.trim();
      if (crumb && !crumb.includes('<') && !crumb.includes('{') && crumb.length >= 3) {
        crumbCache = crumb;
        cookieCache = cookieStr;
        crumbFetchTime = now;
        console.log('✅ Yahoo Finance session ready');
        return { crumb, cookie: cookieStr };
      }
    } catch {
      continue;
    }
  }

  throw new Error('Could not get Yahoo Finance crumb — check your internet connection');
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

    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
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
  console.log('   15-20 min delayed market data — FREE\n');
});
