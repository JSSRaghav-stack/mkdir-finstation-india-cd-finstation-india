import React, { useState, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { STOCK_LIST } from '../data/mockData.js';
import { formatMarketCap } from '../utils/formatters.js';
import { fetchStockDetail, fetchChart, searchStocks, fetchStockSpecificNews } from '../utils/api.js';

const RANGE_OPTIONS = [
  { label: '1M', range: '1mo', interval: '1d' },
  { label: '3M', range: '3mo', interval: '1d' },
  { label: '6M', range: '6mo', interval: '1d' },
  { label: '1Y', range: '1y', interval: '1d' },
];

function Skeleton({ w, h, className }) {
  return <div className={`skeleton rounded ${className || ''}`} style={{ width: w, height: h }} />;
}

function Tooltip2({ label, children }) {
  return (
    <span className="tooltip-container cursor-help">
      <span style={{ borderBottom: '1px dashed #475569' }}>{children}</span>
      <span className="tooltip-text">{label}</span>
    </span>
  );
}

function MetricCard({ label, value, tooltip }) {
  return (
    <div
      className="rounded-lg p-3 card-hover"
      style={{ background: '#0d0d15', border: '1px solid #1e1e2e' }}
    >
      <div className="text-xs mb-1" style={{ color: '#64748b' }}>
        {tooltip ? <Tooltip2 label={tooltip}>{label}</Tooltip2> : label}
      </div>
      <div className="text-lg font-bold" style={{ color: '#f1f5f9' }}>{value}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#1e1e2e', border: '1px solid #2d2d45' }}>
      <div style={{ color: '#94a3b8' }}>{label}</div>
      <div className="font-bold" style={{ color: '#60a5fa' }}>
        ₹{parseFloat(payload[0].value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </div>
    </div>
  );
}

export default function CompanyIntel() {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownItems, setDropdownItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stockData, setStockData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState('1Y');
  const [isLive, setIsLive] = useState(false);
  const [ratioTab, setRatioTab] = useState('Valuation');
  const [liveNews, setLiveNews] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const inputRef = useRef(null);
  const searchTimer = useRef(null);
  const swipeStartX = useRef(null);
  const [beginnerMode, setBeginnerMode] = useState(false);
  const TABS = ['Overview', 'Financials', 'Ratios', 'News'];

  function computeScore(sd) {
    if (!sd) return null;

    const pe  = parseFloat(sd.pe);
    const roe = parseFloat(sd.roe);
    const de  = parseFloat(sd.debtEquity);
    const div = parseFloat(sd.dividendYield);
    const roce = parseFloat(sd.roce);

    // Need at least 2 real data points to show a meaningful score
    const dataPoints = [pe, roe, de].filter(v => !isNaN(v)).length;
    if (dataPoints < 2) return null;

    let score = 5;
    const reasons = [];
    const flags = [];

    if (!isNaN(pe)) {
      if (pe < 15)       { score += 1.5; reasons.push(`Low P/E of ${pe}x — value buy territory`); }
      else if (pe < 25)  { score += 0.5; reasons.push(`Reasonable P/E of ${pe}x`); }
      else if (pe > 60)  { score -= 1.5; flags.push(`Very high P/E of ${pe}x — priced for perfection`); }
      else if (pe > 35)  { score -= 0.5; flags.push(`Elevated P/E of ${pe}x`); }
    }
    if (!isNaN(roe)) {
      if (roe > 25)      { score += 1.5; reasons.push(`Excellent ROE of ${roe}% — strong capital efficiency`); }
      else if (roe > 15) { score += 0.5; reasons.push(`Good ROE of ${roe}%`); }
      else if (roe < 8)  { score -= 1;   flags.push(`Weak ROE of ${roe}% — poor capital efficiency`); }
    }
    if (!isNaN(roce) && !isNaN(roe)) {
      if (roce > roe)    { reasons.push(`ROCE (${roce}%) > ROE (${roe}%) — efficient capital use`); }
    }
    if (!isNaN(de)) {
      if (de < 0.3)      { score += 1;   reasons.push(`Debt-free / near debt-free (D/E ${de}x)`); }
      else if (de < 1)   { score += 0.5; reasons.push(`Manageable debt (D/E ${de}x)`); }
      else if (de > 3)   { score -= 1.5; flags.push(`High debt burden (D/E ${de}x)`); }
      else if (de > 1.5) { score -= 0.5; flags.push(`Moderately leveraged (D/E ${de}x)`); }
    }
    if (!isNaN(div) && div > 2) {
      score += 0.5; reasons.push(`Dividend yield of ${div}% — income for investors`);
    }

    score = Math.min(10, Math.max(1, Math.round(score * 10) / 10));

    let recommendation, recColor, recBg;
    if (score >= 7.5)     { recommendation = 'STRONG BUY'; recColor = '#22c55e'; recBg = 'rgba(34,197,94,0.12)'; }
    else if (score >= 6)  { recommendation = 'BUY';        recColor = '#4ade80'; recBg = 'rgba(74,222,128,0.10)'; }
    else if (score >= 4.5){ recommendation = 'HOLD';       recColor = '#f59e0b'; recBg = 'rgba(245,158,11,0.10)'; }
    else if (score >= 3)  { recommendation = 'REDUCE';     recColor = '#fb923c'; recBg = 'rgba(251,146,60,0.10)'; }
    else                  { recommendation = 'SELL';        recColor = '#ef4444'; recBg = 'rgba(239,68,68,0.10)'; }

    const allReasons = [...reasons, ...flags].slice(0, 4);

    // Build report text only from available data
    const parts = [`${sd.name} is a ${sd.sector || 'diversified'} company.`];
    if (sd.revenue > 0) parts.push(`Revenue (TTM): ₹${Math.round(sd.revenue / 100).toLocaleString('en-IN')} Cr.`);
    if (sd.netProfit > 0) parts.push(`Net Profit: ₹${Math.round(sd.netProfit / 100).toLocaleString('en-IN')} Cr.`);
    if (!isNaN(pe))  parts.push(`P/E: ${pe}x.`);
    if (!isNaN(roe)) parts.push(`ROE: ${roe}%.`);
    if (!isNaN(de))  parts.push(de < 1 ? 'Balance sheet is healthy with low debt.' : de > 2 ? 'Company carries significant debt.' : '');
    parts.push(`Score: ${score}/10 — ${recommendation}.`);
    const report = parts.filter(Boolean).join(' ');

    return { score, recommendation, recColor, recBg, reasons: allReasons, report };
  }

  function getPeerNames(stockData, allStocks) {
    if (!stockData || !allStocks) return [];
    return allStocks
      .filter(s => s.sector === stockData.sector && s.ticker !== stockData.ticker)
      .slice(0, 5)
      .map(s => ({ name: s.name, ticker: s.ticker }));
  }

  const localFiltered = STOCK_LIST.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.ticker.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 12);

  const handleQueryChange = (val) => {
    setQuery(val);
    setShowDropdown(true);
    setDropdownItems(
      STOCK_LIST.filter(
        (s) =>
          s.name.toLowerCase().includes(val.toLowerCase()) ||
          s.ticker.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 12)
    );

    // Also try live search after 400ms debounce
    clearTimeout(searchTimer.current);
    if (val.length >= 2) {
      searchTimer.current = setTimeout(async () => {
        const liveResults = await searchStocks(val);
        if (liveResults && liveResults.length > 0) {
          // Merge: local first, then live ones not already in local
          const localTickers = new Set(
            STOCK_LIST.filter(
              (s) =>
                s.name.toLowerCase().includes(val.toLowerCase()) ||
                s.ticker.toLowerCase().includes(val.toLowerCase())
            ).map((s) => s.ticker)
          );
          const extra = liveResults.filter((r) => !localTickers.has(r.ticker));
          setDropdownItems((prev) => [...prev.slice(0, 8), ...extra.slice(0, 4)]);
        }
      }, 400);
    }
  };

  const handleSelect = async (stock) => {
    setSelected(stock);
    setQuery(stock.name);
    setShowDropdown(false);
    setLoading(true);
    setStockData(null);
    setChartData([]);
    setIsLive(false);
    setLiveNews(null);
    setActiveTab('Overview');
    setRange('1Y');

    // Fetch news in background (non-blocking)
    fetchStockSpecificNews(stock.ticker, stock.name, stock.sector).then(news => {
      if (news && news.length > 0) setLiveNews(news);
    }).catch(() => {});

    try {
      const [liveDetail, liveChart] = await Promise.all([
        fetchStockDetail(stock.ticker),
        fetchChart(stock.ticker, '1y', '1d'),
      ]);

      if (liveDetail && liveDetail.price > 0) {
        setStockData(liveDetail);
        setIsLive(true);
        if (liveChart && liveChart.length > 0) setChartData(liveChart);
        setLoading(false);
        return;
      }
    } catch { /* fall through */ }

    // If live fails, show minimal stub — never stale mock numbers
    setStockData({
      name: stock.name, ticker: stock.ticker,
      sector: stock.sector, exchange: 'NSE',
      price: null, marketCapCr: null,
      pe: null, pb: null, eps: null, beta: null,
      high52w: null, low52w: null, dividendYield: null,
      revenue: null, netProfit: null,
      ebitdaMargin: null, roe: null, roce: null, netMargin: null,
      debtEquity: null, currentRatio: null,
      evEbitda: null, bookValue: null,
      changePct: null, change: null,
      description: `${stock.name} is listed on NSE under the ${stock.sector} sector. Live data unavailable — check server connection.`,
    });
    setChartData([]);
    setLoading(false);
  };

  const rangeOpt = RANGE_OPTIONS.find((r) => r.label === range) || RANGE_OPTIONS[3];

  const displayChart = chartData; // always live data, no mock slicing needed

  const handleRangeChange = async (newRange) => {
    setRange(newRange);
    if (selected) {
      const opt = RANGE_OPTIONS.find((r) => r.label === newRange);
      if (opt) {
        const liveChart = await fetchChart(selected.ticker, opt.range, opt.interval);
        if (liveChart && liveChart.length > 0) setChartData(liveChart);
      }
    }
  };

  const priceChange =
    displayChart.length >= 2
      ? ((displayChart[displayChart.length - 1].close - displayChart[0].close) / displayChart[0].close) * 100
      : 0;

  const fmt = (v, prefix = '') =>
    v === 'N/A' || v === undefined || v === null ? 'N/A' : `${prefix}${v}`;

  const handleSwipeStart = (e) => { swipeStartX.current = e.touches[0].clientX; };
  const handleSwipeEnd = (e) => {
    if (swipeStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(dx) < 40) return;
    const idx = TABS.indexOf(activeTab);
    if (dx < -40 && idx < TABS.length - 1) setActiveTab(TABS[idx + 1]);
    if (dx > 40 && idx > 0) setActiveTab(TABS[idx - 1]);
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#0a0a0f' }}>
      {/* Sticky search */}
      <div className="sticky top-0 z-30 px-4 md:px-6 pt-4 pb-3" style={{ background: '#0a0a0f', borderBottom: stockData ? '1px solid #1a1a2a' : 'none' }}>
      <div className="relative" style={{ maxWidth: 480 }}>
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
          style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
        >
          <span className="text-lg">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => {
              setShowDropdown(true);
              setDropdownItems(localFiltered);
            }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            placeholder="Search NSE stocks — e.g. Reliance, TCS, HDFC..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#e2e8f0' }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setSelected(null); setStockData(null); setChartData([]); setLiveNews(null); setActiveTab('Overview'); setRange('1Y'); }}
              className="text-xs"
              style={{ color: '#475569' }}
            >
              ✕
            </button>
          )}
        </div>
        {showDropdown && query && dropdownItems.length > 0 && (
          <div
            className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden"
            style={{ background: '#12121a', border: '1px solid #1e1e2e', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
          >
            {dropdownItems.map((s) => (
              <button
                key={s.ticker}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors"
                style={{ color: '#e2e8f0' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1a2e')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => handleSelect(s)}
              >
                <div>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-xs" style={{ color: '#475569' }}>{s.ticker}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#1e1e2e', color: '#64748b' }}>
                  {s.sector}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Empty state */}
      {!selected && !loading && (
        <div className="flex flex-col items-center justify-center px-4" style={{ paddingTop: 80 }}>
          <div className="text-6xl mb-4">🔍</div>
          <div className="text-xl font-semibold mb-2" style={{ color: '#94a3b8' }}>Search for a stock</div>
          <div className="text-sm text-center" style={{ color: '#475569', maxWidth: 360 }}>
            Type a company name or NSE ticker above to view detailed financials, price charts, and key ratios.
          </div>
          <div className="flex flex-wrap gap-2 mt-6 justify-center" style={{ maxWidth: 500 }}>
            {['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'HINDUNILVR.NS'].map((t) => {
              const s = STOCK_LIST.find((x) => x.ticker === t);
              return s ? (
                <button
                  key={t}
                  onClick={() => handleSelect(s)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: '#12121a', border: '1px solid #1e1e2e', color: '#64748b' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#60a5fa'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e1e2e'; e.currentTarget.style.color = '#64748b'; }}
                >
                  {s.name}
                </button>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4 px-4 md:px-6 pt-4">
          <Skeleton w="100%" h={100} className="rounded-xl" />
          <Skeleton w="100%" h={240} className="rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => <Skeleton key={i} w="100%" h={80} className="rounded-xl" />)}
          </div>
        </div>
      )}

      {/* No data found */}
      {selected && !loading && !stockData && (
        <div className="flex flex-col items-center justify-center px-4" style={{ paddingTop: 60 }}>
          <div className="text-5xl mb-3">⚠️</div>
          <div className="text-lg font-semibold mb-2" style={{ color: '#94a3b8' }}>
            Data unavailable for {selected.name}
          </div>
          <div className="text-sm" style={{ color: '#475569' }}>
            Unable to load data. Please try again.
          </div>
        </div>
      )}

      {/* Stock data — swipe carousel */}
      {stockData && !loading && (
        <div>
          {/* Compact header — always visible */}
          <div className="px-4 md:px-6 pt-3 pb-3" style={{ background: '#0d0d15' }}>
            {/* Name row */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold leading-tight" style={{ color: '#f1f5f9' }}>{stockData.name}</h2>
                <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                  {stockData.ticker?.replace('.NS', '').replace('.BO', '')}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#1e1e2e', color: '#64748b' }}>{stockData.sector}</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: isLive ? 'rgba(34,197,94,0.08)' : 'rgba(100,116,139,0.08)', color: isLive ? '#4ade80' : '#64748b' }}>
                  {isLive ? '● Live' : '● Cached'}
                </span>
              </div>
              {/* Screener.in link */}
              <a href={`https://www.screener.in/company/${stockData.ticker?.replace(/\.(NS|BO)$/i, '')}/`}
                target="_blank" rel="noopener noreferrer"
                style={{ flexShrink: 0, fontSize: 11, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', color: '#60a5fa', textDecoration: 'none', border: '1px solid #2d2d45', whiteSpace: 'nowrap' }}>
                Screener ↗
              </a>
            </div>
            {/* Price row */}
            <div className="flex items-baseline gap-3 mb-2">
              {stockData.price > 0 ? (
                <span className="text-2xl font-black" style={{ color: '#f1f5f9' }}>
                  ₹{stockData.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              ) : (
                <span className="text-lg font-semibold" style={{ color: '#475569' }}>Price unavailable</span>
              )}
              {stockData.price > 0 && isLive && stockData.changePct !== undefined && (
                <span className="text-sm font-semibold" style={{ color: stockData.changePct >= 0 ? '#22c55e' : '#ef4444' }}>
                  {stockData.changePct >= 0 ? '+' : ''}{stockData.changePct.toFixed(2)}%
                </span>
              )}
              {stockData.price > 0 && isLive && stockData.change !== undefined && (
                <span className="text-xs" style={{ color: '#475569' }}>
                  {stockData.change >= 0 ? '+' : ''}₹{Math.abs(stockData.change).toFixed(2)} today
                </span>
              )}
            </div>
            {/* Quick stats row — horizontal scroll */}
            <div className="flex gap-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {[
                { label: 'Mkt Cap', value: stockData.marketCapCr ? formatMarketCap(stockData.marketCapCr) : '—' },
                { label: 'P/E', value: stockData.pe !== 'N/A' && stockData.pe ? `${stockData.pe}x` : '—' },
                { label: 'ROE', value: stockData.roe !== 'N/A' && stockData.roe ? `${stockData.roe}%` : '—' },
                { label: 'D/E', value: stockData.debtEquity !== 'N/A' && stockData.debtEquity ? `${stockData.debtEquity}x` : '—' },
                { label: '52W H', value: stockData.high52w ? `₹${stockData.high52w.toLocaleString('en-IN')}` : '—' },
                { label: '52W L', value: stockData.low52w ? `₹${stockData.low52w.toLocaleString('en-IN')}` : '—' },
              ].map(item => (
                <div key={item.label} className="flex-shrink-0 text-center">
                  <div className="text-xs" style={{ color: '#475569' }}>{item.label}</div>
                  <div className="text-xs font-semibold mt-0.5" style={{ color: '#e2e8f0' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sticky tab bar — sits below the sticky search bar (~68px) */}
          <div className="sticky z-20 flex border-b overflow-x-auto" style={{ top: 68, background: '#0d0d15', borderColor: '#1a1a2a', scrollbarWidth: 'none' }}>
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  minWidth: 72,
                  minHeight: 44,
                  padding: '10px 4px',
                  fontSize: 13,
                  fontWeight: activeTab === tab ? 600 : 400,
                  color: activeTab === tab ? '#60a5fa' : '#475569',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Swipeable tab content */}
          <div
            className="px-4 md:px-6 py-4 space-y-4"
            onTouchStart={handleSwipeStart}
            onTouchEnd={handleSwipeEnd}
            style={{ minHeight: 400 }}
          >

            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'Overview' && (() => {
              const analysis = computeScore(stockData);
              const peers = getPeerNames(stockData, STOCK_LIST);
              return (
                <div className="space-y-4">
                  {/* Price chart */}
                  {displayChart.length > 0 && (
                    <div className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Price Chart</h3>
                        <div className="flex gap-1">
                          {RANGE_OPTIONS.map((r) => (
                            <button key={r.label} onClick={() => handleRangeChange(r.label)}
                              style={{
                                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                                background: range === r.label ? '#3b82f6' : '#1e1e2e',
                                color: range === r.label ? '#fff' : '#64748b',
                                border: 'none', cursor: 'pointer', minHeight: 28,
                              }}>
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={displayChart} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                          <XAxis dataKey="date"
                            tickFormatter={(v) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            tick={{ fill: '#475569', fontSize: 9 }} interval={Math.floor(displayChart.length / 5)}
                            axisLine={{ stroke: '#1e1e2e' }} tickLine={false} />
                          <YAxis domain={['auto', 'auto']} tick={{ fill: '#475569', fontSize: 9 }}
                            tickFormatter={(v) => `₹${v.toLocaleString('en-IN')}`}
                            axisLine={false} tickLine={false} width={60} />
                          <Tooltip content={<CustomTooltip />} />
                          <Line type="monotone" dataKey="close"
                            stroke={priceChange >= 0 ? '#22c55e' : '#ef4444'} strokeWidth={2}
                            dot={false} activeDot={{ r: 4, fill: priceChange >= 0 ? '#22c55e' : '#ef4444' }} />
                        </LineChart>
                      </ResponsiveContainer>
                      {displayChart.length >= 2 && (
                        <div className="mt-2 text-center text-xs" style={{ color: priceChange >= 0 ? '#22c55e' : '#ef4444' }}>
                          {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}% in {range}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Score + recommendation */}
                  {analysis ? (
                    <div className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <div className="text-2xl font-black" style={{ color: analysis.recColor }}>
                              {analysis.score}<span className="text-sm font-normal" style={{ color: '#475569' }}>/10</span>
                            </div>
                            <div className="text-xs" style={{ color: '#64748b' }}>Score</div>
                          </div>
                          <div className="px-3 py-1.5 rounded-lg font-bold text-sm" style={{ background: analysis.recBg, color: analysis.recColor, border: `1px solid ${analysis.recColor}40` }}>
                            {analysis.recommendation}
                          </div>
                        </div>
                        <button onClick={() => setBeginnerMode(b => !b)}
                          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500, minHeight: 32,
                            background: beginnerMode ? 'rgba(59,130,246,0.15)' : '#1e1e2e',
                            color: beginnerMode ? '#60a5fa' : '#64748b',
                            border: `1px solid ${beginnerMode ? '#3b82f6' : '#2d2d45'}`, cursor: 'pointer' }}>
                          {beginnerMode ? '🎓 ON' : '🎓 Beginner'}
                        </button>
                      </div>
                      <p className="text-xs leading-relaxed mb-3" style={{ color: '#94a3b8' }}>{analysis.report}</p>
                      <div className="space-y-1.5">
                        {analysis.reasons.map((r, i) => {
                          const isFlag = r.toLowerCase().includes('high') || r.toLowerCase().includes('weak') || r.toLowerCase().includes('expensive') || r.toLowerCase().includes('leverage') || r.toLowerCase().includes('poor') || r.toLowerCase().includes('burden') || r.toLowerCase().includes('perfection');
                          return (
                            <div key={i} className="flex items-start gap-2 text-xs" style={{ color: '#94a3b8' }}>
                              <span style={{ color: isFlag ? '#f59e0b' : '#22c55e', flexShrink: 0 }}>{isFlag ? '⚠' : '✓'}</span>
                              <span>{r}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 text-xs" style={{ color: '#334155' }}>Not financial advice. Do your own research before investing.</div>
                    </div>
                  ) : (
                    /* No data — guide user to Screener */
                    <div className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                      <div className="text-sm font-semibold mb-2" style={{ color: '#94a3b8' }}>Insufficient data for scoring</div>
                      <p className="text-xs mb-3" style={{ color: '#475569' }}>
                        Live price data is unavailable for this stock. View complete financials on Screener.in for accurate analysis.
                      </p>
                      <a href={`https://www.screener.in/company/${stockData.ticker?.replace(/\.(NS|BO)$/i, '')}/`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)',
                          textDecoration: 'none' }}>
                        View on Screener.in ↗
                      </a>
                    </div>
                  )}

                  {/* Today's trading — live only */}
                  {isLive && (
                    <div className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                      <div className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>Today's Trading</div>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Open', value: stockData.open ? `₹${stockData.open.toLocaleString('en-IN')}` : '—' },
                          { label: 'Day High', value: stockData.dayHigh ? `₹${stockData.dayHigh.toLocaleString('en-IN')}` : '—', color: '#22c55e' },
                          { label: 'Day Low', value: stockData.dayLow ? `₹${stockData.dayLow.toLocaleString('en-IN')}` : '—', color: '#ef4444' },
                          { label: 'Prev Close', value: stockData.prevClose ? `₹${stockData.prevClose.toLocaleString('en-IN')}` : '—' },
                        ].map(item => (
                          <div key={item.label} className="rounded-lg p-3" style={{ background: '#0d0d15', border: '1px solid #1a1a2a' }}>
                            <div className="text-xs mb-1" style={{ color: '#475569' }}>{item.label}</div>
                            <div className="text-sm font-semibold" style={{ color: item.color || '#e2e8f0' }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sector peers */}
                  {peers.length > 0 && (
                    <div className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                      <div className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>Sector Peers — {stockData.sector}</div>
                      <div className="space-y-1">
                        {peers.map((p, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid #1a1a2a' }}>
                            <span className="text-xs" style={{ color: '#94a3b8' }}>{p.name}</span>
                            <a href={`https://www.screener.in/company/${p.ticker.replace(/\.(NS|BO)$/i, '')}/`}
                              target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 10, color: '#3b82f6', textDecoration: 'none' }}>
                              Screener ↗
                            </a>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-xs" style={{ color: '#334155' }}>Compare live ratios on Screener.in</div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── FINANCIALS TAB ── */}
            {activeTab === 'Financials' && (
              <div className="space-y-4">
                {/* Key financials list */}
                <div className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                  <div className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>Key Financials (TTM)</div>
                  <div className="divide-y" style={{ borderColor: '#1a1a2a' }}>
                    {[
                      { label: 'Revenue', value: stockData.revenue ? `₹${Math.round(stockData.revenue / 100).toLocaleString('en-IN')} Cr` : '—', tooltip: 'Trailing twelve months total revenue' },
                      { label: 'Net Profit', value: stockData.netProfit ? `₹${Math.round(stockData.netProfit / 100).toLocaleString('en-IN')} Cr` : '—', tooltip: 'Profit after all expenses and taxes' },
                      { label: 'EBITDA Margin', value: stockData.ebitdaMargin && stockData.ebitdaMargin !== 'N/A' ? `${stockData.ebitdaMargin}%` : '—', tooltip: 'Operating profit margin' },
                      { label: 'Net Margin', value: stockData.netMargin && stockData.netMargin !== 'N/A' ? `${stockData.netMargin}%` : '—', tooltip: 'Net profit as % of revenue' },
                      { label: 'Return on Equity', value: stockData.roe && stockData.roe !== 'N/A' ? `${stockData.roe}%` : '—', tooltip: 'Net profit as % of shareholder equity' },
                      { label: 'ROCE', value: stockData.roce && stockData.roce !== 'N/A' ? `${stockData.roce}%` : '—', tooltip: 'Return on Capital Employed' },
                      { label: 'Debt / Equity', value: stockData.debtEquity !== 'N/A' && stockData.debtEquity != null ? `${stockData.debtEquity}x` : '—', tooltip: 'Total debt divided by shareholder equity' },
                      { label: 'Current Ratio', value: stockData.currentRatio !== 'N/A' && stockData.currentRatio != null ? `${stockData.currentRatio}x` : '—', tooltip: 'Current assets / current liabilities' },
                      { label: 'EPS (TTM)', value: stockData.eps !== 'N/A' ? `₹${stockData.eps}` : '—', tooltip: 'Earnings per share' },
                      { label: 'Book Value/Share', value: stockData.bookValue !== 'N/A' && stockData.bookValue != null ? `₹${stockData.bookValue}` : '—', tooltip: 'Net asset value per share' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between py-2.5">
                        <span className="text-xs" style={{ color: '#64748b' }}>
                          <Tooltip2 label={item.tooltip}>{item.label}</Tooltip2>
                        </span>
                        <span className="text-sm font-semibold" style={{ color: item.value === '—' ? '#334155' : '#e2e8f0' }}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Valuation metrics grid */}
                <div className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                  <div className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>Valuation Metrics</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'P/E Ratio', value: stockData.pe !== 'N/A' ? `${stockData.pe}x` : '—', tooltip: 'Price to Earnings' },
                      { label: 'P/B Ratio', value: stockData.pb !== 'N/A' ? `${stockData.pb}x` : '—', tooltip: 'Price to Book' },
                      { label: 'EV/EBITDA', value: stockData.evEbitda !== 'N/A' ? `${stockData.evEbitda}x` : '—', tooltip: 'Enterprise Value / EBITDA' },
                      { label: 'Div. Yield', value: stockData.dividendYield != null ? `${stockData.dividendYield}%` : '—', tooltip: 'Annual dividend / Price' },
                      { label: 'Market Cap', value: stockData.marketCapCr ? formatMarketCap(stockData.marketCapCr) : '—', tooltip: 'Total market cap' },
                      { label: 'Beta', value: stockData.beta !== 'N/A' && stockData.beta != null ? `${stockData.beta}` : '—', tooltip: 'Volatility vs Nifty 50' },
                    ].map(item => (
                      <MetricCard key={item.label} label={item.label} value={item.value} tooltip={item.tooltip} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── RATIOS TAB ── */}
            {activeTab === 'Ratios' && (() => {
              const rTabs = ['Valuation', 'Profitability', 'Leverage', 'Liquidity'];
              const sd = stockData;
              const fmtR = (v, suffix='', prefix='') => (v === 'N/A' || v === undefined || v === null) ? '—' : `${prefix}${v}${suffix}`;
              const rev = sd.revenue ? sd.revenue / 100 : null;
              const np = sd.netProfit ? sd.netProfit / 100 : null;
              const nmVal = sd.netMargin != null && sd.netMargin !== 'N/A' ? `${sd.netMargin}%` : (rev && np ? `${(np/rev*100).toFixed(1)}%` : '—');
              const rData = {
                Valuation: [
                  { label: 'P/E Ratio', value: fmtR(sd.pe,'x'), desc: 'Price to Earnings' },
                  { label: 'P/B Ratio', value: fmtR(sd.pb,'x'), desc: 'Price to Book Value' },
                  { label: 'EV/EBITDA', value: fmtR(sd.evEbitda,'x'), desc: 'Enterprise Value to EBITDA' },
                  { label: 'Div. Yield', value: fmtR(sd.dividendYield,'%'), desc: 'Annual dividend / Price' },
                  { label: 'EPS (TTM)', value: sd.eps !== 'N/A' ? `₹${sd.eps}` : '—', desc: 'Earnings per share' },
                  { label: 'Book Value/Share', value: sd.bookValue != null && sd.bookValue !== 'N/A' ? `₹${sd.bookValue}` : '—', desc: 'Net asset value per share' },
                  { label: 'Market Cap', value: sd.marketCapCr ? (sd.marketCapCr > 100000 ? `₹${(sd.marketCapCr/100000).toFixed(1)}L Cr` : `₹${sd.marketCapCr.toLocaleString()} Cr`) : '—', desc: 'Total market cap' },
                  { label: '52W High', value: sd.high52w ? `₹${sd.high52w.toLocaleString('en-IN')}` : '—', desc: '52-week high' },
                  { label: '52W Low', value: sd.low52w ? `₹${sd.low52w.toLocaleString('en-IN')}` : '—', desc: '52-week low' },
                ],
                Profitability: [
                  { label: 'EBITDA Margin', value: fmtR(sd.ebitdaMargin,'%'), desc: 'EBITDA as % of revenue' },
                  { label: 'Net Margin', value: nmVal, desc: 'Net profit / Revenue' },
                  { label: 'ROE', value: fmtR(sd.roe,'%'), desc: 'Return on Equity' },
                  { label: 'ROCE', value: sd.roce != null && sd.roce !== 'N/A' ? `${sd.roce}%` : '—', desc: 'Return on Capital Employed' },
                  { label: 'Revenue TTM', value: rev ? `₹${Math.round(rev).toLocaleString('en-IN')} Cr` : '—', desc: 'TTM revenue' },
                  { label: 'Net Profit TTM', value: np ? `₹${Math.round(np).toLocaleString('en-IN')} Cr` : '—', desc: 'TTM net profit' },
                  { label: 'Beta', value: fmtR(sd.beta), desc: 'Volatility vs Nifty 50' },
                ],
                Leverage: [
                  { label: 'Debt / Equity', value: fmtR(sd.debtEquity,'x'), desc: 'Total debt / Equity' },
                  { label: 'P/B Ratio', value: fmtR(sd.pb,'x'), desc: 'Market price vs book value' },
                  { label: 'Book Value/Share', value: sd.bookValue != null && sd.bookValue !== 'N/A' ? `₹${sd.bookValue}` : '—', desc: 'Net asset value per share' },
                  { label: 'Interest Coverage', value: '—', desc: 'EBIT / Interest expense' },
                  { label: 'Net Debt/EBITDA', value: '—', desc: 'Net debt / EBITDA' },
                ],
                Liquidity: [
                  { label: 'Current Ratio', value: fmtR(sd.currentRatio,'x'), desc: 'Current assets / liabilities' },
                  { label: 'Quick Ratio', value: '—', desc: '(Current assets - Inventory) / liabilities' },
                  { label: 'Cash Ratio', value: '—', desc: 'Cash / Current liabilities' },
                ],
              };
              const rows = rData[ratioTab] || rData['Valuation'];
              return (
                <div className="rounded-xl overflow-hidden" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                  <div className="px-4 pt-4 pb-0">
                    <div className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>Financial Ratios</div>
                    <div className="flex gap-0 border-b overflow-x-auto" style={{ borderColor: '#1a1a2a', scrollbarWidth: 'none' }}>
                      {rTabs.map(t => (
                        <button key={t} onClick={() => setRatioTab(t)}
                          style={{
                            flex: 1, minHeight: 36, padding: '8px 6px', fontSize: 11, fontWeight: ratioTab === t ? 600 : 400,
                            color: ratioTab === t ? '#60a5fa' : '#475569', background: 'transparent', border: 'none', cursor: 'pointer',
                            borderBottom: ratioTab === t ? '2px solid #3b82f6' : '2px solid transparent', whiteSpace: 'nowrap',
                          }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-2.5">
                    {rows.map((r, i) => (
                      <div key={i} className="rounded-lg p-3" style={{ background: '#0d0d15', border: '1px solid #1a1a2a' }}>
                        <div className="text-xs mb-1" style={{ color: '#475569' }} title={r.desc}>{r.label}</div>
                        <div className="text-sm font-bold" style={{ color: r.value === '—' ? '#2d3748' : '#e2e8f0' }}>{r.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── NEWS TAB ── */}
            {activeTab === 'News' && (() => {
              const maKeywords = ['acqui', 'merger', 'buyback', 'fundrais', 'dividend', 'bonus', 'split', 'stake', 'deal', 'takeover', 'order', 'contract', 'mou'];
              const seen = new Set();
              const news = (liveNews || []).filter(n => {
                const key = (n.title || '').toLowerCase().slice(0, 55);
                if (key.length < 10 || seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              const maNews = news.filter(n => maKeywords.some(k => (n.title || '').toLowerCase().includes(k))).slice(0, 4);
              const latestNews = news.filter(n => !maKeywords.some(k => (n.title || '').toLowerCase().includes(k)));
              const isLiveNews = news.length > 0;

              const NewsCard = ({ n }) => {
                const url = n.url || n.link || '#';
                const isExt = url && url !== '#';
                const El = isExt ? 'a' : 'div';
                return (
                  <El href={isExt ? url : undefined} target={isExt ? '_blank' : undefined} rel="noopener noreferrer"
                    className="block rounded-xl p-3 card-hover"
                    style={{ background: '#12121a', border: '1px solid #1e1e2e', textDecoration: 'none' }}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      {n.category && (
                        <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
                          {n.category}
                        </span>
                      )}
                      {isExt && <span className="text-xs flex-shrink-0" style={{ color: '#334155' }}>↗</span>}
                    </div>
                    <div className="text-xs font-medium mb-2 leading-snug" style={{ color: '#e2e8f0' }}>{n.title}</div>
                    <div className="flex justify-between text-xs" style={{ color: '#475569' }}>
                      <span style={{ color: '#64748b' }}>{n.source}</span>
                      <span>{n.time || n.publishedAt || ''}</span>
                    </div>
                  </El>
                );
              };

              return (
                <div className="space-y-4">
                  {/* M&A section */}
                  {maNews.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>Corporate Actions</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>Live</span>
                      </div>
                      <div className="space-y-2">
                        {maNews.map((n, i) => <NewsCard key={i} n={n} />)}
                      </div>
                    </div>
                  )}

                  {/* Latest news */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>Latest News</span>
                      {isLiveNews && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                          ● Live · {news.length}
                        </span>
                      )}
                    </div>
                    {latestNews.length > 0 ? (
                      <div className="space-y-2">
                        {latestNews.slice(0, 10).map((n, i) => <NewsCard key={i} n={n} />)}
                      </div>
                    ) : !isLiveNews ? (
                      /* No news loaded yet — loading state or true empty */
                      <div className="rounded-xl p-5 text-center" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                        <div className="text-2xl mb-2">📰</div>
                        <div className="text-sm font-medium mb-1" style={{ color: '#94a3b8' }}>Fetching live news…</div>
                        <div className="text-xs mb-4" style={{ color: '#475569' }}>News loads in the background. If nothing appears, search directly below.</div>
                        <a href={`https://news.google.com/search?q=${encodeURIComponent(stockData.name + ' NSE stock')}&hl=en-IN&gl=IN`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', textDecoration: 'none' }}>
                          Search on Google News ↗
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })()}

            {/* Tab indicator dots */}
            <div className="flex justify-center gap-2 pt-2 pb-4">
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  style={{
                    width: activeTab === t ? 20 : 6, height: 6, borderRadius: 3,
                    background: activeTab === t ? '#3b82f6' : '#1e1e2e',
                    border: 'none', cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }} />
              ))}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
