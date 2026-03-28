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

async function fetchGiftNiftyLive() {
  try {
    const res = await fetch(`${API_BASE}/api/gift-nifty`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    return json?.data || null;
  } catch {
    return null;
  }
}

export async function fetchIndices() {
  // Fetch main indices + Gift Nifty in parallel
  const [quotes, giftData] = await Promise.all([
    fetchQuote('^NSEI,^BSESN,^INDIAVIX,USDINR=X'),
    fetchGiftNiftyLive(),
  ]);
  if (!quotes) return null;
  const find = (sym) => quotes.find(q => q.symbol === sym);
  const nsei = find('^NSEI');
  const bsesn = find('^BSESN');
  const vix = find('^INDIAVIX');
  const usd = find('USDINR=X');

  // Fix USD/INR — if value looks too small (< 10), it may be inverted (USD per INR)
  let usdinrValue = usd?.regularMarketPrice || 0;
  if (usdinrValue > 0 && usdinrValue < 10) {
    usdinrValue = Math.round((1 / usdinrValue) * 100) / 100;
  }

  return {
    nifty: nsei ? { value: nsei.regularMarketPrice, change: nsei.regularMarketChangePercent, points: nsei.regularMarketChange } : null,
    sensex: bsesn ? { value: bsesn.regularMarketPrice, change: bsesn.regularMarketChangePercent, points: bsesn.regularMarketChange } : null,
    vix: vix ? { value: vix.regularMarketPrice, change: vix.regularMarketChangePercent, points: vix.regularMarketChange } : null,
    usdinr: usd ? { value: usdinrValue, change: usd.regularMarketChangePercent, points: usd.regularMarketChange } : null,
    giftNifty: giftData && giftData.value > 0 ? giftData : null,
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

export async function fetchStockDetail(ticker) {
  // Fetch all five sources in parallel
  const [quotes, fundamentals, screener, indianAPI, alphaVantage] = await Promise.all([
    fetchQuote(ticker),
    fetchFundamentals(ticker),
    fetchScreenerData(ticker),
    fetchIndianAPIStock(ticker, null),
    fetchAlphaVantageData(ticker),
  ]);
  const av = alphaVantage;

  const q = quotes?.[0] || null;
  const ia = indianAPI; // IndianAPI data (may be null)

  // If all sources failed, return null
  const hasYahoo    = q && q.regularMarketPrice > 0;
  const hasScreener = screener && (screener.revenueCr != null || screener.pe != null);
  const hasIndian   = ia && (ia.price != null || ia.pe != null);
  const hasAV       = av && (av.pe != null || av.revenueCr != null);

  if (!hasYahoo && !hasScreener && !hasIndian && !hasAV) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // DATA PRIORITY: Screener (TTM, most accurate for India) >
  //               IndianAPI (live, analyst data) >
  //               Alpha Vantage (fundamentals backup) >
  //               Yahoo Finance (price, P/B, Beta, EV/EBITDA)
  // ─────────────────────────────────────────────────────────────────────────

  // ── Price — Yahoo > IndianAPI > Alpha Vantage ──────────────────────────
  const price = q?.regularMarketPrice || ia?.price || 0;

  // ── Market Cap — Yahoo > Screener > IndianAPI > Alpha Vantage ──────────
  const marketCapCr = q?.marketCap
    ? Math.round(q.marketCap / 10000000)
    : (screener?.marketCapCr || ia?.marketCapCr || av?.marketCapCr || 0);

  // ── EPS — Screener TTM > IndianAPI > Alpha Vantage > Yahoo ────────────
  const eps = screener?.eps != null
    ? Math.round(screener.eps * 100) / 100
    : ia?.eps != null
      ? Math.round(ia.eps * 100) / 100
      : av?.eps != null
        ? Math.round(av.eps * 100) / 100
        : (q?.epsTrailingTwelveMonths ? Math.round(q.epsTrailingTwelveMonths * 100) / 100 : 'N/A');

  // ── P/E — Screener > IndianAPI > Alpha Vantage > Yahoo ────────────────
  let pe = screener?.pe != null
    ? Math.round(screener.pe * 10) / 10
    : ia?.pe != null
      ? Math.round(ia.pe * 10) / 10
      : av?.pe != null
        ? Math.round(av.pe * 10) / 10
        : (q?.trailingPE ? Math.round(q.trailingPE * 10) / 10 : 'N/A');
  // Only calculate from price/EPS if no authoritative source gave a P/E
  if (pe === 'N/A' && price > 0 && eps !== 'N/A' && eps > 0) {
    pe = Math.round((price / eps) * 10) / 10;
  }

  // ── P/B — Yahoo > IndianAPI > Alpha Vantage > calculated ──────────────
  let pb = q?.priceToBook ? Math.round(q.priceToBook * 100) / 100 : 'N/A';
  if (pb === 'N/A' && ia?.pb != null) pb = Math.round(ia.pb * 100) / 100;
  if (pb === 'N/A' && av?.pb != null) pb = Math.round(av.pb * 100) / 100;
  if (pb === 'N/A' && price > 0) {
    const bv = screener?.bookValue || ia?.bookValue || av?.bookValue;
    if (bv > 0) pb = Math.round((price / bv) * 100) / 100;
  }

  // ── Revenue / Net Profit — Screener > IndianAPI > Alpha Vantage > Yahoo ─
  const revenue   = screener?.revenueCr   != null ? Math.round(screener.revenueCr * 100)
    : ia?.revenueCr   != null ? Math.round(ia.revenueCr * 100)
    : av?.revenueCr   != null ? Math.round(av.revenueCr * 100)
    : (fundamentals?.revenue || 0);
  const netProfit = screener?.netProfitCr != null ? Math.round(screener.netProfitCr * 100)
    : ia?.netProfitCr != null ? Math.round(ia.netProfitCr * 100)
    : av?.netProfitCr != null ? Math.round(av.netProfitCr * 100)
    : (fundamentals?.netProfit || 0);

  // ── EBITDA Margin / ROE / ROCE — Screener > IndianAPI > Alpha Vantage > Yahoo ─
  const ebitdaMargin = screener?.opmPercent != null ? screener.opmPercent
    : ia?.opmPercent  != null ? ia.opmPercent
    : av?.opmPercent  != null ? av.opmPercent
    : (fundamentals?.ebitdaMargin ?? 'N/A');
  const roe  = screener?.roe  != null ? screener.roe
    : ia?.roe  != null ? ia.roe
    : av?.roe  != null ? av.roe
    : (fundamentals?.roe ?? 'N/A');
  const roce = screener?.roce != null ? screener.roce
    : ia?.roce != null ? ia.roce
    : 'N/A'; // Alpha Vantage doesn't provide ROCE (Indian metric)

  const netMargin = (revenue > 0 && netProfit > 0)
    ? Math.round((netProfit / revenue) * 1000) / 10
    : 'N/A';

  // ── Debt/Equity — Screener > Alpha Vantage > Yahoo ────────────────────
  const debtEquity = screener?.debtEquity != null ? screener.debtEquity
    : av?.debtEquity != null ? av.debtEquity
    : (fundamentals?.debtEquity ?? 'N/A');

  // ── Current Ratio — Alpha Vantage > Yahoo ─────────────────────────────
  const currentRatio = av?.currentRatio != null ? av.currentRatio
    : (fundamentals?.currentRatio ?? 'N/A');

  // ── Dividend Yield — Screener > IndianAPI > Alpha Vantage > Yahoo ──────
  const dividendYield = screener?.dividendYield != null ? screener.dividendYield
    : ia?.dividendYield  != null ? ia.dividendYield
    : av?.dividendYield  != null ? av.dividendYield
    : (q?.dividendYield ? Math.round(q.dividendYield * 10000) / 100 : 0);

  // ── Book Value — Screener > IndianAPI > Alpha Vantage ─────────────────
  const bookValue = screener?.bookValue ?? ia?.bookValue ?? av?.bookValue ?? 'N/A';

  // ── EV/EBITDA — Yahoo > Alpha Vantage ─────────────────────────────────
  const evEbitda = fundamentals?.evEbitda != null && fundamentals.evEbitda !== 'N/A'
    ? fundamentals.evEbitda
    : av?.evEbitda ?? 'N/A';

  // ── Beta — Yahoo > Alpha Vantage ──────────────────────────────────────
  const beta = q?.beta
    ? Math.round(q.beta * 100) / 100
    : av?.beta ?? 'N/A';

  // ── 52-Week High/Low — Yahoo > IndianAPI > Alpha Vantage ──────────────
  const high52w = q?.fiftyTwoWeekHigh  || ia?.high52w || av?.high52w || 0;
  const low52w  = q?.fiftyTwoWeekLow   || ia?.low52w  || av?.low52w  || 0;

  return {
    name:        q?.longName || q?.shortName || av?.name || ia?.companyProfile?.split('.')[0] || ticker.replace('.NS', ''),
    ticker:      q?.symbol   || ticker,
    sector:      q?.industry || av?.sector || ia?.industry || 'N/A',
    exchange:    q?.exchange === 'NSI' ? 'NSE' : (q?.exchange || 'NSE'),
    description: ia?.companyProfile || av?.description || `${q?.longName || q?.shortName || ticker} listed on NSE.`,
    price,
    marketCap:   marketCapCr ? marketCapCr.toString() : 'N/A',
    marketCapCr,
    high52w, low52w,
    pe, pb, eps,
    evEbitda,
    dividendYield,
    beta,
    revenue, netProfit, ebitdaMargin, roe, roce, netMargin,
    debtEquity, currentRatio,
    bookValue,
    // Balance sheet from Screener (for accurate DCF net debt)
    totalBorrowings:    screener?.totalBorrowings    ?? null,
    cashAndEquivalents: screener?.cashAndEquivalents ?? null,
    shareholderEquity:  screener?.shareholderEquity  ?? null,
    // Analyst data from IndianAPI
    analystRating:  ia?.analystRating  || null,
    analystReco:    ia?.analystReco    || null,
    shortTermTrend: ia?.shortTermTrend || null,
    longTermTrend:  ia?.longTermTrend  || null,
    dayHigh:     q?.regularMarketDayHigh || ia?.dayHigh || 0,
    dayLow:      q?.regularMarketDayLow          || 0,
    open:        q?.regularMarketOpen            || 0,
    prevClose:   q?.regularMarketPreviousClose   || 0,
    volume:      q?.regularMarketVolume          || 0,
    change:      q?.regularMarketChange          || 0,
    changePct:   q?.regularMarketChangePercent   || 0,
  };
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
