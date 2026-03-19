// Yahoo Finance API helper via proxy server
const API_BASE = 'http://localhost:3001';

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

export async function fetchIndices() {
  const quotes = await fetchQuote('^NSEI,^BSESN,^INDIAVIX,USDINR=X');
  if (!quotes) return null;
  const find = (sym) => quotes.find(q => q.symbol === sym);
  const nsei = find('^NSEI');
  const bsesn = find('^BSESN');
  const vix = find('^INDIAVIX');
  const usd = find('USDINR=X');
  return {
    nifty: nsei ? { value: nsei.regularMarketPrice, change: nsei.regularMarketChangePercent, points: nsei.regularMarketChange } : null,
    sensex: bsesn ? { value: bsesn.regularMarketPrice, change: bsesn.regularMarketChangePercent, points: bsesn.regularMarketChange } : null,
    vix: vix ? { value: vix.regularMarketPrice, change: vix.regularMarketChangePercent, points: vix.regularMarketChange } : null,
    usdinr: usd ? { value: usd.regularMarketPrice, change: usd.regularMarketChangePercent, points: usd.regularMarketChange } : null,
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

export async function fetchStockDetail(ticker) {
  const [quotes, fundamentals] = await Promise.all([
    fetchQuote(ticker),
    fetchFundamentals(ticker),
  ]);
  if (!quotes || quotes.length === 0) return null;
  const q = quotes[0];
  return {
    name: q.longName || q.shortName || ticker.replace('.NS', ''),
    ticker: q.symbol,
    sector: q.industry || 'N/A',
    exchange: q.exchange === 'NSI' ? 'NSE' : q.exchange || 'NSE',
    description: `${q.longName || q.shortName} listed on ${q.exchange === 'NSI' ? 'NSE' : q.exchange}.`,
    price: q.regularMarketPrice || 0,
    marketCap: q.marketCap ? (q.marketCap / 10000000).toFixed(0) : 'N/A',
    marketCapCr: q.marketCap ? Math.round(q.marketCap / 10000000) : 0,
    high52w: q.fiftyTwoWeekHigh || 0,
    low52w: q.fiftyTwoWeekLow || 0,
    pe: q.trailingPE ? Math.round(q.trailingPE * 10) / 10 : 'N/A',
    pb: q.priceToBook ? Math.round(q.priceToBook * 100) / 100 : 'N/A',
    eps: q.epsTrailingTwelveMonths ? Math.round(q.epsTrailingTwelveMonths * 100) / 100 : 'N/A',
    evEbitda: fundamentals?.evEbitda ?? 'N/A',
    dividendYield: q.dividendYield ? Math.round(q.dividendYield * 10000) / 100 : 0,
    beta: q.beta ? Math.round(q.beta * 100) / 100 : 'N/A',
    revenue: fundamentals?.revenue || 0,
    netProfit: fundamentals?.netProfit || 0,
    ebitdaMargin: fundamentals?.ebitdaMargin ?? 'N/A',
    roe: fundamentals?.roe ?? 'N/A',
    debtEquity: fundamentals?.debtEquity ?? 'N/A',
    currentRatio: fundamentals?.currentRatio ?? 'N/A',
    dayHigh: q.regularMarketDayHigh || 0,
    dayLow: q.regularMarketDayLow || 0,
    open: q.regularMarketOpen || 0,
    prevClose: q.regularMarketPreviousClose || 0,
    volume: q.regularMarketVolume || 0,
    change: q.regularMarketChange || 0,
    changePct: q.regularMarketChangePercent || 0,
  };
}
