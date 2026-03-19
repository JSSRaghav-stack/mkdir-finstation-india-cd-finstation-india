import { createServer } from 'http';
import https from 'https';
import { parse } from 'url';

const PORT = 3001;

// Cache crumb and cookies to avoid fetching every time
let crumbCache = null;
let cookieCache = null;
let crumbFetchTime = 0;
const CRUMB_TTL = 30 * 60 * 1000; // 30 minutes

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Referer': 'https://finance.yahoo.com/',
};

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      const cookies = res.headers['set-cookie'] || [];
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ data, cookies, status: res.statusCode }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
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

  console.log('🔄 Fetching new Yahoo Finance crumb...');

  // Step 1: Get cookies from Yahoo Finance homepage
  const homeRes = await httpsGet('https://finance.yahoo.com/', BASE_HEADERS);
  const cookieStr = homeRes.cookies.map(c => c.split(';')[0]).join('; ');

  // Step 2: Get crumb using the cookies
  const crumbRes = await httpsGet('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    ...BASE_HEADERS,
    'Cookie': cookieStr,
  });

  const crumb = crumbRes.data.trim();
  if (!crumb || crumb.includes('<') || crumb.length < 3) {
    throw new Error('Failed to get valid crumb from Yahoo Finance');
  }

  crumbCache = crumb;
  cookieCache = cookieStr;
  crumbFetchTime = now;
  console.log('✅ Got crumb successfully');

  return { crumb, cookie: cookieStr };
}

async function fetchYF(url) {
  const { crumb, cookie } = await getCrumb();
  const urlWithCrumb = `${url}&crumb=${encodeURIComponent(crumb)}`;

  const result = await httpsGet(urlWithCrumb, {
    ...BASE_HEADERS,
    'Cookie': cookie,
  });

  if (result.status === 401 || result.status === 403) {
    // Crumb expired — clear cache and retry once
    crumbCache = null;
    cookieCache = null;
    const fresh = await getCrumb();
    const retryUrl = `${url}&crumb=${encodeURIComponent(fresh.crumb)}`;
    const retryResult = await httpsGet(retryUrl, {
      ...BASE_HEADERS,
      'Cookie': fresh.cookie,
    });
    return JSON.parse(retryResult.data);
  }

  try {
    return JSON.parse(result.data);
  } catch (e) {
    console.error('Yahoo Finance raw response:', result.data.substring(0, 200));
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
  console.log('   Fetching live data from Yahoo Finance (NSE/BSE)');
  console.log('   15-20 min delayed market data — FREE\n');
});
