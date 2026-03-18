// Seeded PRNG for consistent mock data
class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  nextGaussian() {
    // Box-Muller transform
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1 + 0.0001)) * Math.cos(2 * Math.PI * u2);
  }
}

function generatePriceHistory(startPrice, endPrice, volatility, seed) {
  const rng = new SeededRandom(seed);
  const days = 365;
  const prices = [];
  const now = new Date('2026-03-18');
  const totalReturn = Math.log(endPrice / startPrice);
  const dailyDrift = totalReturn / 252;

  let price = startPrice;
  let tradingDay = 0;

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;

    if (tradingDay === 0) {
      price = startPrice;
    }

    const noise = rng.nextGaussian() * volatility;
    price = price * Math.exp(dailyDrift + noise);
    price = Math.max(price, startPrice * 0.5);

    prices.push({
      date: date.toISOString().split('T')[0],
      close: Math.round(price * 100) / 100,
      volume: Math.round((rng.next() * 5000000 + 1000000)),
    });
    tradingDay++;
  }
  return prices;
}

export const STOCK_LIST = [
  { ticker: 'RELIANCE.NS', name: 'Reliance Industries', sector: 'Energy & Retail' },
  { ticker: 'TCS.NS', name: 'Tata Consultancy Services', sector: 'Information Technology' },
  { ticker: 'HDFCBANK.NS', name: 'HDFC Bank', sector: 'Banking' },
  { ticker: 'INFY.NS', name: 'Infosys', sector: 'Information Technology' },
  { ticker: 'HINDUNILVR.NS', name: 'Hindustan Unilever', sector: 'FMCG' },
  { ticker: 'ICICIBANK.NS', name: 'ICICI Bank', sector: 'Banking' },
  { ticker: 'WIPRO.NS', name: 'Wipro', sector: 'Information Technology' },
  { ticker: 'BAJFINANCE.NS', name: 'Bajaj Finance', sector: 'NBFC' },
  { ticker: 'MARUTI.NS', name: 'Maruti Suzuki', sector: 'Automobile' },
  { ticker: 'TITAN.NS', name: 'Titan Company', sector: 'Consumer Discretionary' },
  { ticker: 'SUNPHARMA.NS', name: 'Sun Pharmaceutical', sector: 'Pharmaceuticals' },
  { ticker: 'LT.NS', name: 'Larsen & Toubro', sector: 'Infrastructure' },
  { ticker: 'AXISBANK.NS', name: 'Axis Bank', sector: 'Banking' },
  { ticker: 'ITC.NS', name: 'ITC Limited', sector: 'FMCG' },
  { ticker: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank', sector: 'Banking' },
];

export const ALL_NIFTY50 = [
  { ticker: 'RELIANCE.NS', name: 'Reliance', price: 2847.35, change: 1.24, volume: 8234521 },
  { ticker: 'TCS.NS', name: 'TCS', price: 3412.80, change: -0.82, volume: 2134567 },
  { ticker: 'HDFCBANK.NS', name: 'HDFC Bank', price: 1623.45, change: 0.56, volume: 5678901 },
  { ticker: 'INFY.NS', name: 'Infosys', price: 1498.70, change: -1.23, volume: 4321098 },
  { ticker: 'HINDUNILVR.NS', name: 'HUL', price: 2287.60, change: 0.34, volume: 1234567 },
  { ticker: 'ICICIBANK.NS', name: 'ICICI Bank', price: 1087.25, change: 2.15, volume: 7654321 },
  { ticker: 'KOTAKBANK.NS', name: 'Kotak Bank', price: 1834.90, change: 1.87, volume: 2345678 },
  { ticker: 'BHARTIARTL.NS', name: 'Bharti Airtel', price: 1672.30, change: 3.21, volume: 3456789 },
  { ticker: 'ITC.NS', name: 'ITC', price: 432.15, change: -0.45, volume: 9876543 },
  { ticker: 'LT.NS', name: 'L&T', price: 3287.45, change: 1.56, volume: 1876543 },
  { ticker: 'AXISBANK.NS', name: 'Axis Bank', price: 1124.80, change: 2.34, volume: 4567890 },
  { ticker: 'MARUTI.NS', name: 'Maruti Suzuki', price: 11234.60, change: -1.87, volume: 567890 },
  { ticker: 'TITAN.NS', name: 'Titan', price: 3456.75, change: 4.23, volume: 1234567 },
  { ticker: 'SUNPHARMA.NS', name: 'Sun Pharma', price: 1678.90, change: -2.34, volume: 2345678 },
  { ticker: 'ULTRACEMCO.NS', name: 'UltraTech', price: 10234.50, change: 0.78, volume: 345678 },
  { ticker: 'WIPRO.NS', name: 'Wipro', price: 298.45, change: -3.12, volume: 5678901 },
  { ticker: 'BAJFINANCE.NS', name: 'Bajaj Finance', price: 7123.40, change: 2.67, volume: 876543 },
  { ticker: 'NESTLEIND.NS', name: 'Nestlé India', price: 2345.60, change: -0.67, volume: 234567 },
  { ticker: 'TECHM.NS', name: 'Tech Mahindra', price: 1567.80, change: -1.45, volume: 1234567 },
  { ticker: 'MM.NS', name: 'Mahindra & Mahindra', price: 2897.30, change: 3.89, volume: 2345678 },
];

export const SECTOR_DATA = [
  { name: 'IT', change: 1.24, color: '#3b82f6', stocks: ['TCS.NS', 'INFY.NS', 'WIPRO.NS', 'TECHM.NS'] },
  { name: 'Banking', change: -0.34, color: '#8b5cf6', stocks: ['HDFCBANK.NS', 'ICICIBANK.NS', 'KOTAKBANK.NS', 'AXISBANK.NS'] },
  { name: 'FMCG', change: 0.56, color: '#22c55e', stocks: ['HINDUNILVR.NS', 'ITC.NS', 'NESTLEIND.NS'] },
  { name: 'Auto', change: 1.87, color: '#f59e0b', stocks: ['MARUTI.NS', 'MM.NS'] },
  { name: 'Pharma', change: -2.34, color: '#ef4444', stocks: ['SUNPHARMA.NS'] },
  { name: 'Energy', change: 1.24, color: '#06b6d4', stocks: ['RELIANCE.NS'] },
  { name: 'Infra', change: 0.78, color: '#84cc16', stocks: ['LT.NS', 'ULTRACEMCO.NS'] },
  { name: 'NBFC', change: 2.67, color: '#f97316', stocks: ['BAJFINANCE.NS', 'TITAN.NS'] },
];

export const MARKET_INDICES = {
  nifty: { value: 22456.80, change: 0.74, points: 165.40 },
  sensex: { value: 73847.15, change: 0.69, points: 507.20 },
  vix: { value: 14.23, change: -3.21, points: -0.47 },
  usdinr: { value: 83.47, change: 0.12, points: 0.10 },
};

export const MOCK_NEWS = [
  {
    id: 1,
    title: 'Nifty 50 scales new highs as FII inflows surge; IT, Banking lead rally',
    source: 'Economic Times',
    time: '2 hours ago',
    url: '#',
    category: 'Markets',
  },
  {
    id: 2,
    title: 'RBI holds repo rate steady at 6.5%; signals accommodative stance ahead',
    source: 'Business Standard',
    time: '4 hours ago',
    url: '#',
    category: 'Macro',
  },
  {
    id: 3,
    title: 'Reliance Industries Q3 results: Net profit jumps 18% YoY to ₹18,540 Cr',
    source: 'Moneycontrol',
    time: '5 hours ago',
    url: '#',
    category: 'Earnings',
  },
  {
    id: 4,
    title: 'TCS bags $2.5 billion multi-year deal from European banking giant',
    source: 'Livemint',
    time: '7 hours ago',
    url: '#',
    category: 'Deals',
  },
  {
    id: 5,
    title: 'Budget 2026: Capex allocation hiked 15% to ₹11.1 lakh crore for FY27',
    source: 'CNBC-TV18',
    time: '9 hours ago',
    url: '#',
    category: 'Policy',
  },
  {
    id: 6,
    title: 'SEBI introduces new framework for direct market access by retail investors',
    source: 'Financial Express',
    time: '12 hours ago',
    url: '#',
    category: 'Regulation',
  },
];

// Full mock data for 5 detailed stocks
export const DETAILED_STOCK_DATA = {
  'RELIANCE.NS': {
    name: 'Reliance Industries Ltd',
    ticker: 'RELIANCE.NS',
    sector: 'Energy & Retail',
    exchange: 'NSE',
    description: 'India\'s largest private sector company, with business interests spanning petrochemicals, refining, oil, telecommunications, and retail.',
    price: 2847.35,
    marketCap: '19,24,560',
    marketCapCr: 1924560,
    high52w: 3120.55,
    low52w: 2220.30,
    pe: 28.4,
    pb: 2.52,
    eps: 100.26,
    evEbitda: 14.2,
    dividendYield: 0.31,
    beta: 1.02,
    revenue: 941173,
    netProfit: 70000,
    ebitdaMargin: 17.2,
    roe: 10.8,
    debtEquity: 0.41,
    currentRatio: 1.34,
    priceHistory: generatePriceHistory(2350, 2847, 0.013, 42),
    news: [
      { title: 'Reliance Jio surpasses 500 million subscribers milestone', source: 'ET', time: '1d ago' },
      { title: 'Reliance Retail to expand to 200 new cities in FY26', source: 'Mint', time: '3d ago' },
      { title: 'Reliance signs MoU for green hydrogen plant in Rajasthan', source: 'BS', time: '5d ago' },
      { title: 'Q3 FY26: Reliance net profit up 18% YoY; O2C segment leads growth', source: 'CNBC', time: '1w ago' },
    ],
  },
  'TCS.NS': {
    name: 'Tata Consultancy Services Ltd',
    ticker: 'TCS.NS',
    sector: 'Information Technology',
    exchange: 'NSE',
    description: 'Global IT services, consulting and business solutions leader. India\'s most valuable IT company serving Fortune 500 clients across 55 countries.',
    price: 3412.80,
    marketCap: '12,38,420',
    marketCapCr: 1238420,
    high52w: 4592.25,
    low52w: 3085.50,
    pe: 26.8,
    pb: 13.4,
    eps: 127.34,
    evEbitda: 22.1,
    dividendYield: 1.52,
    beta: 0.72,
    revenue: 241987,
    netProfit: 46099,
    ebitdaMargin: 25.6,
    roe: 52.4,
    debtEquity: 0.0,
    currentRatio: 3.24,
    priceHistory: generatePriceHistory(4200, 3412, 0.014, 99),
    news: [
      { title: 'TCS wins ₹2,500 Cr digital transformation deal from BFSI major', source: 'ET', time: '2d ago' },
      { title: 'TCS Q3: Revenue up 5.6% YoY; EBIT margin holds at 24.5%', source: 'Mint', time: '4d ago' },
      { title: 'TCS to hire 40,000 freshers in FY27 as deal momentum picks up', source: 'BS', time: '6d ago' },
      { title: 'TCS launches AI-first platform for banking & financial services', source: 'NDTV', time: '1w ago' },
    ],
  },
  'HDFCBANK.NS': {
    name: 'HDFC Bank Ltd',
    ticker: 'HDFCBANK.NS',
    sector: 'Banking',
    exchange: 'NSE',
    description: 'India\'s largest private sector bank by assets. Offers a wide range of banking products and financial services to retail and wholesale customers.',
    price: 1623.45,
    marketCap: '12,34,870',
    marketCapCr: 1234870,
    high52w: 1880.00,
    low52w: 1363.55,
    pe: 20.3,
    pb: 2.86,
    eps: 79.97,
    evEbitda: 'N/A',
    dividendYield: 1.17,
    beta: 1.08,
    revenue: 237296,
    netProfit: 60812,
    ebitdaMargin: 'N/A',
    roe: 16.1,
    debtEquity: 7.2,
    currentRatio: 'N/A',
    priceHistory: generatePriceHistory(1750, 1623, 0.012, 77),
    news: [
      { title: 'HDFC Bank Q3 net profit rises 2.2% to ₹16,736 Cr', source: 'ET', time: '1d ago' },
      { title: 'HDFC Bank launches new co-branded credit card with Apple Pay', source: 'Mint', time: '3d ago' },
      { title: 'HDFC Bank NIM stabilizes at 3.5%; loan growth back on track at 9%', source: 'BS', time: '4d ago' },
      { title: 'HDFC Bank to raise ₹50,000 Cr via AT1 bonds over next 12 months', source: 'CNBC', time: '1w ago' },
    ],
  },
  'INFY.NS': {
    name: 'Infosys Ltd',
    ticker: 'INFY.NS',
    sector: 'Information Technology',
    exchange: 'NSE',
    description: 'Global leader in next-generation digital services and consulting. Enables clients in 56 countries to navigate their digital transformation.',
    price: 1498.70,
    marketCap: '6,23,540',
    marketCapCr: 623540,
    high52w: 1942.25,
    low52w: 1358.35,
    pe: 23.4,
    pb: 7.32,
    eps: 64.05,
    evEbitda: 18.6,
    dividendYield: 2.54,
    beta: 0.87,
    revenue: 153670,
    netProfit: 27070,
    ebitdaMargin: 22.1,
    roe: 32.8,
    debtEquity: 0.0,
    currentRatio: 2.45,
    priceHistory: generatePriceHistory(1650, 1498, 0.014, 55),
    news: [
      { title: 'Infosys raises FY26 revenue guidance to 4.5–5% in constant currency', source: 'ET', time: '2d ago' },
      { title: 'Infosys wins $900M 5-year deal from UK retail giant', source: 'Mint', time: '4d ago' },
      { title: 'Infosys-Q3: Net profit up 11.4%; headcount addition resumes', source: 'BS', time: '5d ago' },
      { title: 'Infosys\'s AI platform Topaz sees 60% QoQ surge in client adoption', source: 'CNBC', time: '1w ago' },
    ],
  },
  'HINDUNILVR.NS': {
    name: 'Hindustan Unilever Ltd',
    ticker: 'HINDUNILVR.NS',
    sector: 'FMCG',
    exchange: 'NSE',
    description: 'India\'s largest FMCG company with over 50 brands across Home Care, Beauty & Personal Care, and Foods & Refreshment segments.',
    price: 2287.60,
    marketCap: '5,37,290',
    marketCapCr: 537290,
    high52w: 2778.45,
    low52w: 2102.10,
    pe: 53.7,
    pb: 10.87,
    eps: 42.60,
    evEbitda: 49.8,
    dividendYield: 1.82,
    beta: 0.62,
    revenue: 62301,
    netProfit: 10098,
    ebitdaMargin: 24.3,
    roe: 20.4,
    debtEquity: 0.0,
    currentRatio: 1.42,
    priceHistory: generatePriceHistory(2650, 2287, 0.010, 33),
    news: [
      { title: 'HUL Q3: Volume growth returns to 4% on rural recovery; margins expand 80bps', source: 'ET', time: '1d ago' },
      { title: 'HUL launches premium skincare line targeting Gen Z consumers', source: 'Mint', time: '3d ago' },
      { title: 'HUL increases prices across home care portfolio by 3–5%', source: 'BS', time: '6d ago' },
      { title: 'Unilever global strategy shift seen positive for HUL India unit', source: 'CNBC', time: '1w ago' },
    ],
  },
};
