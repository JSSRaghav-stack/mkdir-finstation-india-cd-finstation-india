// Yahoo Finance API helper via proxy server
// In production (Railway/Render) same origin is used; locally points to proxy server
const API_BASE = (typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1')
  ? ''
  : 'http://localhost:3001';

// Default FMP API key (hardcoded — no setup needed)
const DEFAULT_FMP_KEY = '4csJHhT1Qn74tSp6IZjrMGGAyk8jU3Qs';

// Default Finnhub API key (hardcoded — no setup needed)
const DEFAULT_FINNHUB_KEY = 'd6u2f89r01qp1k9auq1gd6u2f89r01qp1k9auq20';

export async function fetchQuote(symbols) {
  try {
    const res = await fetch(`${API_BASE}/api/quote?symbols=${encodeURIComponent(symbols)}`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return data?.quoteResponse?.result || [];
  } catch {
    return null;
  }
}

export async function fetchChart(symbol, range = '1y', interval = '1d') {
  try {
    const res = await fetch(`${API_BASE}/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    return timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      close: closes[i] ? Math.round(closes[i] * 100) / 100 : null,
      volume: volumes[i] || 0,
    })).filter(d => d.close !== null);
  } catch {
    return null;
  }
}

export async function searchStocks(query) {
  try {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return (data?.quotes || []).filter(q => q.exchDisp === 'NSE' || q.exchDisp === 'BSE' || q.exchange === 'NSI' || q.exchange === 'BSE').map(q => ({
      ticker: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      sector: q.industry || q.typeDisp || 'Equity',
      exchange: q.exchDisp || q.exchange,
    }));
  } catch {
    return [];
  }
}

export async function fetchGiftNiftyLive() {
  try {
    const res = await fetch(`${API_BASE}/api/gift-nifty`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (!res.ok || typeof json?.price !== 'number') return null;
    return {
      value:     json.price,
      points:    json.change,
      change:    json.percent,
      timestamp: json.timestamp,
    };
  } catch {
    return null;
  }
}

export async function fetchIndices() {
  const quotes = await fetchQuote('^NSEI,^BSESN,^INDIAVIX,USDINR=X');
  if (!quotes) return null;
  const find = (sym) => quotes.find(q => q.symbol === sym);
  const nsei  = find('^NSEI');
  const bsesn = find('^BSESN');
  const vix   = find('^INDIAVIX');
  const usd   = find('USDINR=X');

  // Fix USD/INR — if value looks too small (< 10), it may be inverted (USD per INR)
  let usdinrValue = usd?.regularMarketPrice || 0;
  if (usdinrValue > 0 && usdinrValue < 10) {
    usdinrValue = Math.round((1 / usdinrValue) * 100) / 100;
  }

  return {
    nifty:    nsei  ? { value: nsei.regularMarketPrice,  change: nsei.regularMarketChangePercent,  points: nsei.regularMarketChange  } : null,
    sensex:   bsesn ? { value: bsesn.regularMarketPrice, change: bsesn.regularMarketChangePercent, points: bsesn.regularMarketChange } : null,
    vix:      vix   ? { value: vix.regularMarketPrice,   change: vix.regularMarketChangePercent,   points: vix.regularMarketChange   } : null,
    usdinr:   usd   ? { value: usdinrValue, change: usd.regularMarketChangePercent, points: usd.regularMarketChange } : null,
    giftNifty: null,
  };
}

export async function fetchNifty50Quotes() {
  const symbols = 'RELIANCE.NS,TCS.NS,HDFCBANK.NS,INFY.NS,ICICIBANK.NS,HINDUNILVR.NS,ITC.NS,KOTAKBANK.NS,LT.NS,AXISBANK.NS,BAJFINANCE.NS,BHARTIARTL.NS,MARUTI.NS,TITAN.NS,SUNPHARMA.NS,ULTRACEMCO.NS,WIPRO.NS,NESTLEIND.NS,TECHM.NS,MM.NS,POWERGRID.NS,NTPC.NS,ONGC.NS,TATAMOTORS.NS,TATASTEEL.NS,JSWSTEEL.NS,HCLTECH.NS,ADANIENT.NS,ADANIPORTS.NS,APOLLOHOSP.NS,ASIANPAINT.NS,BAJAJFINSV.NS,BPCL.NS,BRITANNIA.NS,CIPLA.NS,DIVISLAB.NS,DRREDDY.NS,EICHERMOT.NS,HEROMOTOCO.NS,HINDALCO.NS,INDUSINDBK.NS,SBILIFE.NS,SBIN.NS,SHRIRAMFIN.NS,TATACONSUM.NS,TRENT.NS,COALINDIA.NS,GRASIM.NS,BAJAJ-AUTO.NS,BEL.NS';
  const quotes = await fetchQuote(symbols);
  if (!quotes || quotes.length === 0) return null;
  return quotes.map(q => ({
    ticker: q.symbol,
    name: q.shortName || q.longName || q.symbol.replace('.NS', ''),
    price: q.regularMarketPrice || 0,
    change: q.regularMarketChangePercent || 0,
    volume: q.regularMarketVolume || 0,
  }));
}

// Sector mapping for Nifty 50 stocks (for live sector heatmap)
const NIFTY50_SECTOR_MAP = {
  'RELIANCE.NS':'Energy', 'ONGC.NS':'Energy', 'BPCL.NS':'Energy',
  'TCS.NS':'IT', 'INFY.NS':'IT', 'WIPRO.NS':'IT', 'HCLTECH.NS':'IT', 'TECHM.NS':'IT',
  'HDFCBANK.NS':'Banking', 'ICICIBANK.NS':'Banking', 'KOTAKBANK.NS':'Banking',
  'AXISBANK.NS':'Banking', 'SBIN.NS':'Banking', 'INDUSINDBK.NS':'Banking',
  'BAJFINANCE.NS':'Finance', 'BAJAJFINSV.NS':'Finance', 'SBILIFE.NS':'Finance', 'SHRIRAMFIN.NS':'Finance',
  'HINDUNILVR.NS':'FMCG', 'ITC.NS':'FMCG', 'NESTLEIND.NS':'FMCG', 'BRITANNIA.NS':'FMCG', 'TATACONSUM.NS':'FMCG',
  'SUNPHARMA.NS':'Pharma', 'CIPLA.NS':'Pharma', 'DIVISLAB.NS':'Pharma', 'DRREDDY.NS':'Pharma', 'APOLLOHOSP.NS':'Pharma',
  'MARUTI.NS':'Auto', 'TATAMOTORS.NS':'Auto', 'MM.NS':'Auto', 'EICHERMOT.NS':'Auto', 'HEROMOTOCO.NS':'Auto', 'BAJAJ-AUTO.NS':'Auto',
  'LT.NS':'Infra', 'ADANIPORTS.NS':'Infra', 'BEL.NS':'Infra', 'ADANIENT.NS':'Infra',
  'TATASTEEL.NS':'Metals', 'JSWSTEEL.NS':'Metals', 'HINDALCO.NS':'Metals',
  'POWERGRID.NS':'Power', 'NTPC.NS':'Power', 'COALINDIA.NS':'Power',
  'ASIANPAINT.NS':'Consumer', 'TITAN.NS':'Consumer', 'TRENT.NS':'Consumer',
  'BHARTIARTL.NS':'Telecom',
  'ULTRACEMCO.NS':'Cement', 'GRASIM.NS':'Cement',
};

export function computeSectorHeatmap(quotes) {
  if (!quotes || quotes.length === 0) return null;
  const sectors = {};
  for (const q of quotes) {
    const sector = NIFTY50_SECTOR_MAP[q.ticker];
    if (!sector) continue;
    if (!sectors[sector]) sectors[sector] = { total: 0, count: 0 };
    sectors[sector].total += q.change || 0;
    sectors[sector].count += 1;
  }
  return Object.entries(sectors)
    .map(([name, { total, count }]) => ({
      name,
      change: Math.round((total / count) * 100) / 100,
    }))
    .sort((a, b) => b.change - a.change);
}

export async function fetchFundamentals(symbol) {
  try {
    const res = await fetch(`${API_BASE}/api/fundamentals?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return null;
    const fd = result.financialData || {};
    const ks = result.defaultKeyStatistics || {};
    return {
      // Store revenue in Crore * 100 units to match existing display code (divides by 100 to show Cr)
      revenue: Math.round((fd.totalRevenue?.raw || 0) / 100000),
      netProfit: Math.round((fd.netIncomeToCommon?.raw || 0) / 100000),
      ebitdaMargin: fd.ebitdaMargins?.raw != null ? Math.round(fd.ebitdaMargins.raw * 1000) / 10 : 'N/A',
      roe: fd.returnOnEquity?.raw != null ? Math.round(fd.returnOnEquity.raw * 1000) / 10 : 'N/A',
      debtEquity: fd.debtToEquity?.raw != null ? Math.round(fd.debtToEquity.raw * 100) / 100 : 'N/A',
      currentRatio: fd.currentRatio?.raw != null ? Math.round(fd.currentRatio.raw * 100) / 100 : 'N/A',
      evEbitda: ks.enterpriseToEbitda?.raw != null ? Math.round(ks.enterpriseToEbitda.raw * 10) / 10 : 'N/A',
    };
  } catch {
    return null;
  }
}

// Fetch TTM financials from Screener.in (more accurate for Indian stocks)
export async function fetchScreenerData(symbol) {
  try {
    const cleanSymbol = symbol.replace(/\.(NS|BO)$/i, '');
    const res = await fetch(
      `${API_BASE}/api/screener?symbol=${encodeURIComponent(cleanSymbol)}`,
      { signal: AbortSignal.timeout(25000) },
    );
    const json = await res.json();
    return json?.success ? json.data : null;
  } catch {
    return null;
  }
}

// Fetch comprehensive stock data from IndianAPI
export async function fetchIndianAPIStock(ticker, companyName) {
  try {
    // Strip exchange suffix; clean common company name suffixes for better match
    const name = (companyName || ticker.replace(/\.(NS|BO)$/i, ''))
      .replace(/\s+(limited|ltd\.?|industries|corporation|corp\.?)\s*$/i, '')
      .trim();
    const res = await fetch(
      `${API_BASE}/api/indianapi/stock?name=${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(12000) },
    );
    const json = await res.json();
    if (!json?.success || !json.data) return null;
    const d = json.data;

    // Normalise the IndianAPI response into a flat object our code understands
    const km = d.keyMetrics || {};
    const fin = d.financials || {};
    const nsePrice = d.currentPrice?.NSE || d.currentPrice?.BSE || null;
    const pctChange = parseFloat(d.percentChange) || null;

    return {
      // Price
      price:         nsePrice ? parseFloat(String(nsePrice).replace(/,/g, '')) : null,
      change:        pctChange,
      volume:        d.volume ? parseInt(String(d.volume).replace(/,/g, '')) : null,
      open:          d.open   ? parseFloat(String(d.open).replace(/,/g, ''))  : null,
      high52w:       d.yearHigh ? parseFloat(String(d.yearHigh).replace(/,/g, '')) : null,
      low52w:        d.yearLow  ? parseFloat(String(d.yearLow).replace(/,/g, ''))  : null,
      dayHigh:       d.intradayHigh ? parseFloat(String(d.intradayHigh).replace(/,/g, '')) : null,
      dayLow:        d.intradayLow  ? parseFloat(String(d.intradayLow).replace(/,/g, ''))  : null,
      prevClose:     d.previousClose ? parseFloat(String(d.previousClose).replace(/,/g, '')) : null,
      // Fundamentals from keyMetrics
      pe:            km.pe    != null ? parseFloat(km.pe)    : null,
      pb:            km.pb    != null ? parseFloat(km.pb)    : null,
      eps:           km.eps   != null ? parseFloat(km.eps)   : null,
      roe:           km.roe   != null ? parseFloat(km.roe)   : null,
      roce:          km.roce  != null ? parseFloat(km.roce)  : null,
      dividendYield: (() => {
        if (km.dividendYield == null) return null;
        let divY = parseFloat(km.dividendYield);
        if (divY > 25) divY = divY / 100; // basis-points → percentage (e.g. 207 → 2.07)
        return divY;
      })(),
      bookValue:     km.bookValue     != null ? parseFloat(km.bookValue)     : null,
      marketCapCr:   km.marketCap
        ? Math.round(parseFloat(String(km.marketCap).replace(/,/g, '')) / 10000000)
        : null,
      // Financials
      revenueCr:   fin.revenue   ? Math.round(parseFloat(String(fin.revenue).replace(/,/g, ''))   / 10000000) : null,
      netProfitCr: fin.netProfit ? Math.round(parseFloat(String(fin.netProfit).replace(/,/g, '')) / 10000000) : null,
      opmPercent:  fin.operatingMargin != null ? parseFloat(fin.operatingMargin) : null,
      // Company info
      companyProfile: d.companyProfile || null,
      industry:       d.industry       || null,
      // Analyst data
      analystRating:  d.overallRating  || null,
      analystReco:    d.analystRecommendation || null,
      shortTermTrend: d.shortTermTrend || null,
      longTermTrend:  d.longTermTrend  || null,
    };
  } catch (e) {
    console.warn('fetchIndianAPIStock error:', e.message);
    return null;
  }
}

// Fetch Alpha Vantage OVERVIEW (fundamentals) for Indian stocks
export async function fetchAlphaVantageData(ticker) {
  try {
    const res = await fetch(
      `${API_BASE}/api/alphavantage/overview?symbol=${encodeURIComponent(ticker)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    const json = await res.json();
    return json?.success ? json.data : null;
  } catch {
    return null;
  }
}

// ── Primary entry point: uses server-side normalized endpoint ────────────────
// All validation, priority merging, and caching happens server-side.
// Returns a flat object with consistent field names used by ALL pages
// (CompanyIntel, DCF, LBO, AIResearch, Dashboard).
// Null fields = data genuinely not available (never estimated/assumed).
export async function fetchStockDetail(ticker) {
  try {
    const [normalizedRes, screenerRaw] = await Promise.all([
      fetch(
        `${API_BASE}/api/stock-normalized?symbol=${encodeURIComponent(ticker)}`,
        { signal: AbortSignal.timeout(40000) },
      ),
      fetchScreenerData(ticker),
    ]);
    const json = await normalizedRes.json();
    if (!json?.success || !json.data) return null;

    const d = json.data;
    const s = screenerRaw || {};
    // n(): screener-only numeric — null if not a finite number (no fallback to server data)
    const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const num = (v) => (v !== null && v !== undefined ? v : null);
    const display = (v) => (v !== null && v !== undefined ? v : 'N/A');

    return {
      // Identity (from server — screener doesn't provide these)
      name:        d.name        || ticker.replace(/\.(NS|BO)$/i, ''),
      ticker:      d.ticker      || ticker,
      sector:      d.sector      || 'N/A',
      exchange:    d.exchange    || 'NSE',
      description: d.description || null,
      // Price & market (from server — real-time)
      price:       num(d.price)    || 0,
      marketCap:   d.marketCapCr   ? d.marketCapCr.toString() : 'N/A',
      marketCapCr: num(d.marketCapCr) || 0,
      high52w:     num(d.high52w)  || 0,
      low52w:      num(d.low52w)   || 0,
      dayHigh:     num(d.dayHigh)  || 0,
      dayLow:      num(d.dayLow)   || 0,
      open:        num(d.open)     || 0,
      prevClose:   num(d.prevClose)|| 0,
      volume:      num(d.volume)   || 0,
      change:      num(d.change)   || 0,
      changePct:   num(d.changePct)|| 0,
      // Fundamentals — SCREENER-ONLY (null if screener didn't return it)
      pe:            display(n(s.pe)),
      pb:            display(d.pb),   // screener doesn't have P/B
      eps:           display(n(s.eps)),
      roe:           display(n(s.roe)),
      roce:          display(n(s.roce)),
      ebitdaMargin:  display(d.ebitdaMargin), // keep server value for display
      netMargin:     display(d.netMargin),
      dividendYield: d.dividendYield ?? 0,
      bookValue:     display(n(s.bookValue)),
      debtEquity:    display(n(s.debtEquity)),
      currentRatio:  display(n(s.currentRatio)),
      evEbitda:      display(d.evEbitda),
      beta:          display(d.beta),
      // Financials (Cr×100 legacy)
      revenue:    d.revenue   ?? 0,
      netProfit:  d.netProfit ?? 0,
      // DCF/LBO fields — SCREENER-ONLY numeric values (null = not found on screener)
      revenueCr:          n(s.revenueCr),
      netProfitCr:        n(s.netProfitCr),
      opmPercent:         n(s.opmPercent),
      totalBorrowings:    n(s.totalBorrowings),
      cashAndEquivalents: n(s.cashAndEquivalents),
      shareholderEquity:  n(s.shareholderEquity),
      // Analyst (IndianAPI via server)
      analystRating:  d.analystRating  || null,
      analystReco:    d.analystReco    || null,
      shortTermTrend: d.shortTermTrend || null,
      longTermTrend:  d.longTermTrend  || null,
      dataProvider: screenerRaw ? 'screener' : 'mixed',
    };
  } catch (e) {
    console.warn('fetchStockDetail error:', e.message);
    return null;
  }
}

// ─── FMP API functions ─────────────────────────────────────────────────────

// Fetch 20+ financial ratios from FMP
export async function fetchFMPRatios(symbol, apiKey) {
  const key = apiKey || localStorage.getItem('fmp_api_key') || DEFAULT_FMP_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `${API_BASE}/api/fmp/ratios?symbol=${encodeURIComponent(symbol)}&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const json = await res.json();
    if (!json?.success || !json.data || !Array.isArray(json.data) || json.data.length === 0) return null;
    const r = json.data[0];
    return {
      // Valuation
      pe: r.priceEarningsRatio ?? 'N/A',
      forwardPE: r.priceEarningsToGrowthRatio ?? 'N/A',
      pb: r.priceToBookRatio ?? 'N/A',
      ps: r.priceToSalesRatio ?? 'N/A',
      pFcf: r.priceToFreeCashFlowsRatio ?? 'N/A',
      evEbitda: r.enterpriseValueMultiple ?? 'N/A',
      evEbit: r.evToOperatingCashFlow ?? 'N/A',
      evRevenue: r.enterpriseValueOverEBITDA ?? 'N/A',
      // Profitability
      roe: r.returnOnEquity != null ? Math.round(r.returnOnEquity * 1000) / 10 : 'N/A',
      roa: r.returnOnAssets != null ? Math.round(r.returnOnAssets * 1000) / 10 : 'N/A',
      roic: r.returnOnCapitalEmployed != null ? Math.round(r.returnOnCapitalEmployed * 1000) / 10 : 'N/A',
      grossMargin: r.grossProfitMargin != null ? Math.round(r.grossProfitMargin * 1000) / 10 : 'N/A',
      ebitdaMargin: r.ebitdaMargin != null ? Math.round(r.ebitdaMargin * 1000) / 10 : 'N/A',
      operatingMargin: r.operatingProfitMargin != null ? Math.round(r.operatingProfitMargin * 1000) / 10 : 'N/A',
      netMargin: r.netProfitMargin != null ? Math.round(r.netProfitMargin * 1000) / 10 : 'N/A',
      fcfMargin: r.freeCashFlowOperatingCashFlowRatio != null ? Math.round(r.freeCashFlowOperatingCashFlowRatio * 1000) / 10 : 'N/A',
      // Leverage
      debtEquity: r.debtEquityRatio ?? 'N/A',
      netDebtEbitda: r.netDebtToEBITDA ?? 'N/A',
      interestCoverage: r.interestCoverage ?? 'N/A',
      debtAssets: r.totalDebtToAssets ?? 'N/A',
      // Liquidity
      currentRatio: r.currentRatio ?? 'N/A',
      quickRatio: r.quickRatio ?? 'N/A',
      cashRatio: r.cashRatio ?? 'N/A',
      operatingCashFlowRatio: r.operatingCashFlowRatio ?? 'N/A',
      // Efficiency
      assetTurnover: r.assetTurnover ?? 'N/A',
      inventoryTurnover: r.inventoryTurnover ?? 'N/A',
      receivablesTurnover: r.receivablesTurnover ?? 'N/A',
      dso: r.daysOfSalesOutstanding ?? 'N/A',
      dpo: r.daysPayablesOutstanding ?? 'N/A',
      // Growth
      revenueGrowth: r.revenueGrowth != null ? Math.round(r.revenueGrowth * 1000) / 10 : 'N/A',
      epsGrowth: r.epsgrowth != null ? Math.round(r.epsgrowth * 1000) / 10 : 'N/A',
    };
  } catch (e) {
    console.error('fetchFMPRatios error:', e.message);
    return null;
  }
}

// Fetch income statement, balance sheet, and cash flow from FMP
export async function fetchFMPFinancials(symbol, apiKey) {
  const key = apiKey || localStorage.getItem('fmp_api_key') || DEFAULT_FMP_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `${API_BASE}/api/fmp/financials?symbol=${encodeURIComponent(symbol)}&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(20000) }
    );
    const json = await res.json();
    if (!json?.success) return null;
    return {
      income: json.income || [],
      balance: json.balance || [],
      cashflow: json.cashflow || [],
    };
  } catch (e) {
    console.error('fetchFMPFinancials error:', e.message);
    return null;
  }
}

// Fetch live company news from Finnhub (with Yahoo Finance fallback)
export async function fetchCompanyNews(symbol, companyName, finnhubKey) {
  const key = finnhubKey || localStorage.getItem('finnhub_api_key') || DEFAULT_FINNHUB_KEY;
  try {
    const params = new URLSearchParams({ symbol });
    if (key) params.set('finnhubKey', key);
    if (companyName) params.set('company', companyName);
    const res = await fetch(
      `${API_BASE}/api/news/company?${params.toString()}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const json = await res.json();
    return json?.news || [];
  } catch (e) {
    console.error('fetchCompanyNews error:', e.message);
    return [];
  }
}

// Fetch stock-specific news with deduplication and recency filtering
export async function fetchStockSpecificNews(symbol, companyName, sector) {
  try {
    // Build a specific search query for this stock
    const cleanSymbol = symbol.replace(/\.(NS|BO)$/i, '');
    const params = new URLSearchParams({
      symbol,
      company: companyName || cleanSymbol,
      sector: sector || '',
      query: `${companyName || cleanSymbol} stock India ${sector || ''}`.trim(),
    });
    const res = await fetch(
      `${API_BASE}/api/news/company?${params.toString()}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const json = await res.json();
    const news = json?.news || [];

    // Deduplicate by title (case-insensitive) and URL
    const seen = new Set();
    const unique = news.filter(item => {
      const key = (item.title || '').toLowerCase().trim().slice(0, 60);
      const urlKey = item.url || '';
      if (seen.has(key) || (urlKey && seen.has(urlKey))) return false;
      seen.add(key);
      if (urlKey) seen.add(urlKey);
      return true;
    });

    // Show news up to 30 days old, fall back to all if none have timestamps
    const now = Date.now();
    const recent = unique.filter(item => {
      if (!item.datetime && !item.publishedAt) return true; // include if no timestamp
      const ts = item.datetime ? item.datetime * 1000 : new Date(item.publishedAt).getTime();
      return (now - ts) < 30 * 24 * 60 * 60 * 1000;
    });

    return recent.length > 0 ? recent : unique;
  } catch (e) {
    console.error('fetchStockSpecificNews error:', e.message);
    return [];
  }
}

// Fetch live market news from Finnhub (with Yahoo Finance fallback)
export async function fetchMarketNews(finnhubKey) {
  const key = finnhubKey || localStorage.getItem('finnhub_api_key') || DEFAULT_FINNHUB_KEY;
  try {
    const params = key ? `?finnhubKey=${encodeURIComponent(key)}` : '';
    const res = await fetch(
      `${API_BASE}/api/news/market${params}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const json = await res.json();
    return json?.news || [];
  } catch (e) {
    console.error('fetchMarketNews error:', e.message);
    return [];
  }
}

// Fetch live Indian market news from RSS feeds (ET, Moneycontrol, NDTV Profit, LiveMint, BS)
export async function fetchIndiaNews() {
  try {
    const res = await fetch(
      `${API_BASE}/api/india-news`,
      { signal: AbortSignal.timeout(15000) }
    );
    const json = await res.json();
    return json?.news || [];
  } catch (e) {
    console.error('fetchIndiaNews error:', e.message);
    return [];
  }
}

// Fetch Yahoo Finance news for a symbol
export async function fetchYahooNews(symbol) {
  try {
    const res = await fetch(
      `${API_BASE}/api/yahoo-news?symbol=${encodeURIComponent(symbol)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const json = await res.json();
    return json?.news || [];
  } catch {
    return [];
  }
}
