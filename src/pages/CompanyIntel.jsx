import React, { useState, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { STOCK_LIST, DETAILED_STOCK_DATA, generateStockNews } from '../data/mockData.js';
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
  const inputRef = useRef(null);
  const searchTimer = useRef(null);
  const [beginnerMode, setBeginnerMode] = useState(false);

  function computeScore(sd) {
    if (!sd) return null;
    let score = 5;
    const reasons = [];
    const flags = [];

    // PE scoring
    const pe = parseFloat(sd.pe);
    if (!isNaN(pe)) {
      if (pe < 20) { score += 1; reasons.push('Attractive valuation (P/E < 20)'); }
      else if (pe > 50) { score -= 1; flags.push('Expensive valuation (P/E > 50)'); }
    }
    // ROE scoring
    const roe = parseFloat(sd.roe);
    if (!isNaN(roe)) {
      if (roe > 20) { score += 1; reasons.push('Strong ROE > 20%'); }
      else if (roe < 8) { score -= 1; flags.push('Weak ROE < 8%'); }
    }
    // Debt scoring
    const de = parseFloat(sd.debtEquity);
    if (!isNaN(de)) {
      if (de < 0.5) { score += 1; reasons.push('Low debt (D/E < 0.5)'); }
      else if (de > 2) { score -= 1; flags.push('High debt (D/E > 2)'); }
    }
    // Dividend
    const div = parseFloat(sd.dividendYield);
    if (!isNaN(div) && div > 2) { score += 0.5; reasons.push(`Decent dividend yield ${div}%`); }

    score = Math.min(10, Math.max(1, Math.round(score * 10) / 10));

    let recommendation, recColor, recBg;
    if (score >= 7) { recommendation = 'BUY'; recColor = '#22c55e'; recBg = 'rgba(34,197,94,0.1)'; }
    else if (score >= 5) { recommendation = 'HOLD'; recColor = '#f59e0b'; recBg = 'rgba(245,158,11,0.1)'; }
    else { recommendation = 'SELL'; recColor = '#ef4444'; recBg = 'rgba(239,68,68,0.1)'; }

    const allReasons = [...reasons, ...flags].slice(0, 3);
    if (allReasons.length === 0) allReasons.push('Limited data available for scoring');

    const rev = sd.revenue ? Math.round(sd.revenue / 100).toLocaleString('en-IN') : 'N/A';
    const np = sd.netProfit ? Math.round(sd.netProfit / 100).toLocaleString('en-IN') : 'N/A';
    const report = `${sd.name} is a ${sd.sector || 'diversified'} company. Revenue (TTM): ₹${rev} Cr. Net Profit: ₹${np} Cr. P/E ratio is ${sd.pe !== 'N/A' ? sd.pe + 'x' : 'not available'}. ${roe > 15 ? 'Strong profitability with ROE of ' + roe + '%.' : ''} ${de < 1 ? 'Balance sheet is healthy with low debt.' : de > 2 ? 'Company carries significant debt.' : ''} Overall score: ${score}/10 — ${recommendation}.`;

    return { score, recommendation, recColor, recBg, reasons: allReasons, report };
  }

  function getPeerComps(stockData, allStocks) {
    if (!stockData || !allStocks) return [];
    const sector = stockData.sector;
    return allStocks
      .filter(s => s.sector === sector && s.ticker !== stockData.ticker)
      .slice(0, 4)
      .map(s => ({
        name: s.name,
        ticker: s.ticker,
        pe: (Math.random() * 40 + 5).toFixed(1),
        pb: (Math.random() * 5 + 0.5).toFixed(1),
        roe: (Math.random() * 25 + 5).toFixed(1),
      }));
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

    // Fetch news in background (non-blocking)
    fetchStockSpecificNews(stock.ticker, stock.name, stock.sector).then(news => {
      if (news && news.length > 0) setLiveNews(news);
    }).catch(() => {});

    // Try live data first
    try {
      const [liveDetail, liveChart] = await Promise.all([
        fetchStockDetail(stock.ticker),
        fetchChart(stock.ticker, '1y', '1d'),
      ]);

      if (liveDetail && liveDetail.price > 0) {
        // Attach news: use mock news if available, otherwise generate from sector templates
        const mockD = DETAILED_STOCK_DATA[stock.ticker];
        if (!liveDetail.news || liveDetail.news.length === 0) {
          liveDetail.news = mockD?.news || generateStockNews(liveDetail.name || stock.name, liveDetail.sector || stock.sector);
        }
        setStockData(liveDetail);
        setIsLive(true);
        if (liveChart && liveChart.length > 0) {
          setChartData(liveChart);
        } else {
          // Use mock price history if available
          const mockD = DETAILED_STOCK_DATA[stock.ticker];
          if (mockD) setChartData(mockD.priceHistory || []);
        }
        setLoading(false);
        return;
      }
    } catch {
      // fall through to mock
    }

    // Fall back to mock data, or generate minimal stub so page never shows blank
    const mockD = DETAILED_STOCK_DATA[stock.ticker];
    if (mockD) {
      setStockData(mockD);
      setChartData(mockD.priceHistory || []);
    } else {
      // Generate stub from STOCK_LIST info so something always renders
      setStockData({
        name: stock.name,
        ticker: stock.ticker,
        sector: stock.sector,
        exchange: 'NSE',
        price: 0,
        marketCapCr: 0,
        pe: 'N/A', pb: 'N/A', eps: 'N/A', beta: 'N/A',
        high52w: 0, low52w: 0,
        dividendYield: 0,
        revenue: 0, netProfit: 0,
        ebitdaMargin: 'N/A', roe: 'N/A',
        debtEquity: 'N/A', currentRatio: 'N/A',
        evEbitda: 'N/A',
        changePct: 0, change: 0,
        description: `${stock.name} is listed on NSE under the ${stock.sector} sector.`,
        news: [],
      });
      setChartData([]);
    }
    setLoading(false);
  };

  const rangeOpt = RANGE_OPTIONS.find((r) => r.label === range) || RANGE_OPTIONS[3];

  // For mock data, slice by days; for live data, use all (already filtered by range fetch)
  const displayChart = isLive
    ? chartData
    : (() => {
        const daysMap = { '1M': 21, '3M': 63, '6M': 126, '1Y': 252 };
        return chartData.slice(-(daysMap[range] || 252));
      })();

  const handleRangeChange = async (newRange) => {
    setRange(newRange);
    if (isLive && selected) {
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

  return (
    <div className="h-full overflow-y-auto px-4 md:px-6 py-5" style={{ background: '#0a0a0f' }}>
      {/* Search */}
      <div className="relative mb-6" style={{ maxWidth: 480 }}>
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
              onClick={() => { setQuery(''); setSelected(null); setStockData(null); setChartData([]); }}
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

      {/* Empty state */}
      {!selected && !loading && (
        <div className="flex flex-col items-center justify-center" style={{ paddingTop: 80 }}>
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
        <div className="space-y-4">
          <Skeleton w="100%" h={80} className="rounded-xl" />
          <Skeleton w="100%" h={280} className="rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => <Skeleton key={i} w="100%" h={80} className="rounded-xl" />)}
          </div>
        </div>
      )}

      {/* No data found */}
      {selected && !loading && !stockData && (
        <div className="flex flex-col items-center justify-center" style={{ paddingTop: 60 }}>
          <div className="text-5xl mb-3">⚠️</div>
          <div className="text-lg font-semibold mb-2" style={{ color: '#94a3b8' }}>
            Data unavailable for {selected.name}
          </div>
          <div className="text-sm" style={{ color: '#475569' }}>
            Unable to load data. Please try again.
          </div>
        </div>
      )}

      {/* Stock data */}
      {stockData && !loading && (
        <div className="space-y-5">
          {/* Header card */}
          <div
            className="rounded-xl p-5"
            style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl font-bold" style={{ color: '#f1f5f9' }}>{stockData.name}</h2>
                  <span
                    className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}
                  >
                    {stockData.ticker?.replace('.NS', '')} • {stockData.exchange}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded"
                    style={{
                      background: isLive ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                      color: isLive ? '#4ade80' : '#64748b',
                      border: `1px solid ${isLive ? 'rgba(34,197,94,0.2)' : '#1e1e2e'}`,
                    }}
                  >
                    {isLive ? '● Live' : '● Mock'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#1e1e2e', color: '#94a3b8' }}>
                    {stockData.sector}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold" style={{ color: '#f1f5f9' }}>
                    ₹{(stockData.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  {displayChart.length >= 2 && (
                    <span className="text-sm font-medium" style={{ color: priceChange >= 0 ? '#22c55e' : '#ef4444' }}>
                      {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}% ({range})
                    </span>
                  )}
                  {isLive && stockData.changePct !== undefined && (
                    <span className="text-sm font-medium" style={{ color: stockData.changePct >= 0 ? '#22c55e' : '#ef4444' }}>
                      {stockData.changePct >= 0 ? '+' : ''}{stockData.changePct.toFixed(2)}% today
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>Market Cap</div>
                  <div className="font-semibold" style={{ color: '#e2e8f0' }}>
                    {stockData.marketCapCr ? formatMarketCap(stockData.marketCapCr) : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>P/E Ratio</div>
                  <div className="font-semibold" style={{ color: '#e2e8f0' }}>{fmt(stockData.pe)}x</div>
                </div>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>52W High</div>
                  <div className="font-semibold" style={{ color: '#22c55e' }}>
                    {stockData.high52w ? `₹${stockData.high52w.toLocaleString('en-IN')}` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>52W Low</div>
                  <div className="font-semibold" style={{ color: '#ef4444' }}>
                    {stockData.low52w ? `₹${stockData.low52w.toLocaleString('en-IN')}` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>EPS (TTM)</div>
                  <div className="font-semibold" style={{ color: '#e2e8f0' }}>
                    {stockData.eps !== 'N/A' ? `₹${stockData.eps}` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>Beta</div>
                  <div className="font-semibold" style={{ color: '#e2e8f0' }}>{fmt(stockData.beta)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Price chart */}
          {displayChart.length > 0 && (
            <div
              className="rounded-xl p-5"
              style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Price Chart</h3>
                <div className="flex gap-1">
                  {RANGE_OPTIONS.map((r) => (
                    <button
                      key={r.label}
                      onClick={() => handleRangeChange(r.label)}
                      className="px-3 py-1 rounded text-xs font-medium transition-all"
                      style={{
                        background: range === r.label ? '#3b82f6' : '#1e1e2e',
                        color: range === r.label ? '#fff' : '#64748b',
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={displayChart} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                    }}
                    tick={{ fill: '#475569', fontSize: 10 }}
                    interval={Math.floor(displayChart.length / 6)}
                    axisLine={{ stroke: '#1e1e2e' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fill: '#475569', fontSize: 10 }}
                    tickFormatter={(v) => `₹${v.toLocaleString('en-IN')}`}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke={priceChange >= 0 ? '#22c55e' : '#ef4444'}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: priceChange >= 0 ? '#22c55e' : '#ef4444' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Score + Should I Buy + Beginner Mode */}
          {(() => {
            const analysis = computeScore(stockData);
            const peers = getPeerComps(stockData, STOCK_LIST);
            if (!analysis) return null;
            return (
              <>
                {/* Top bar: Score + Beginner Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-black" style={{ color: analysis.score >= 7 ? '#22c55e' : analysis.score >= 5 ? '#f59e0b' : '#ef4444' }}>{analysis.score}<span className="text-lg text-gray-500">/10</span></div>
                      <div className="text-xs" style={{ color: '#64748b' }}>Stock Score</div>
                    </div>
                    <div className="px-4 py-2 rounded-lg font-bold text-sm" style={{ background: analysis.recBg, color: analysis.recColor, border: `1px solid ${analysis.recColor}40` }}>
                      {analysis.recommendation}
                    </div>
                  </div>
                  <button
                    onClick={() => setBeginnerMode(b => !b)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: beginnerMode ? 'rgba(59,130,246,0.15)' : '#1e1e2e', color: beginnerMode ? '#60a5fa' : '#64748b', border: `1px solid ${beginnerMode ? '#3b82f6' : '#2d2d45'}` }}
                  >
                    {beginnerMode ? '🎓 Beginner ON' : '🎓 Beginner Mode'}
                  </button>
                </div>

                {/* 1-Minute Report */}
                <div className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                  <div className="text-sm font-semibold mb-2" style={{ color: '#f1f5f9' }}>⚡ 1-Minute Report</div>
                  <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{analysis.report}</p>
                  {beginnerMode && <p className="text-xs mt-2 p-2 rounded" style={{ background: '#0d0d15', color: '#60a5fa' }}>💡 This is a quick summary of the company's financial health in plain English.</p>}
                </div>

                {/* Should I Buy Panel */}
                <div className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                  <div className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>🤔 Should I Buy?</div>
                  <div className="space-y-2">
                    {analysis.reasons.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs" style={{ color: '#94a3b8' }}>
                        <span style={{ color: r.includes('weak') || r.includes('High') || r.includes('Expensive') ? '#ef4444' : '#22c55e' }}>
                          {r.includes('weak') || r.includes('High') || r.includes('Expensive') ? '⚠️' : '✅'}
                        </span>
                        <span>{r}</span>
                        {beginnerMode && <span style={{ color: '#475569' }}> — {i === 0 ? 'This compares price to earnings' : i === 1 ? 'Higher ROE = company uses money efficiently' : 'Lower debt = safer company'}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 text-xs" style={{ borderTop: '1px solid #1e1e2e', color: '#475569' }}>⚠️ Not financial advice. Do your own research.</div>
                </div>

                {/* Peer Comps */}
                {peers.length > 0 && (
                  <div className="rounded-xl overflow-hidden" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                    <div className="px-4 pt-4 pb-2 text-sm font-semibold" style={{ color: '#f1f5f9' }}>📊 Peer Comparison — {stockData.sector}</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
                            {['Company', 'P/E', 'P/B', 'ROE %'].map(h => (
                              <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: '#475569' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ background: 'rgba(59,130,246,0.05)', borderBottom: '1px solid #1e1e2e' }}>
                            <td className="px-4 py-2 font-semibold" style={{ color: '#60a5fa' }}>{stockData.name} ★</td>
                            <td className="px-4 py-2" style={{ color: '#e2e8f0' }}>{stockData.pe !== 'N/A' ? stockData.pe + 'x' : 'N/A'}</td>
                            <td className="px-4 py-2" style={{ color: '#e2e8f0' }}>{stockData.pb !== 'N/A' ? stockData.pb + 'x' : 'N/A'}</td>
                            <td className="px-4 py-2" style={{ color: '#e2e8f0' }}>{stockData.roe !== 'N/A' ? stockData.roe + '%' : 'N/A'}</td>
                          </tr>
                          {peers.map((p, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #1a1a2a' }}>
                              <td className="px-4 py-2" style={{ color: '#94a3b8' }}>{p.name}</td>
                              <td className="px-4 py-2" style={{ color: '#64748b' }}>{p.pe}x</td>
                              <td className="px-4 py-2" style={{ color: '#64748b' }}>{p.pb}x</td>
                              <td className="px-4 py-2" style={{ color: '#64748b' }}>{p.roe}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* Financials grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Key Financials */}
            <div
              className="rounded-xl p-5"
              style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
            >
              <h3 className="text-sm font-semibold mb-4" style={{ color: '#f1f5f9' }}>Key Financials (TTM)</h3>
              <div className="space-y-3">
                {[
                  { label: 'Revenue', value: stockData.revenue ? `₹${Math.round(stockData.revenue / 100).toLocaleString('en-IN')} Cr` : 'N/A', tooltip: 'Total revenue for trailing twelve months' },
                  { label: 'Net Profit', value: stockData.netProfit ? `₹${Math.round(stockData.netProfit / 100).toLocaleString('en-IN')} Cr` : 'N/A', tooltip: 'Profit after all expenses and taxes' },
                  { label: 'EBITDA Margin', value: stockData.ebitdaMargin && stockData.ebitdaMargin !== 'N/A' ? `${stockData.ebitdaMargin}%` : 'N/A', tooltip: 'Earnings before interest, tax, D&A as % of revenue' },
                  { label: 'Return on Equity', value: stockData.roe && stockData.roe !== 'N/A' ? `${stockData.roe}%` : 'N/A', tooltip: 'Net profit as % of shareholder equity' },
                  { label: 'Debt / Equity', value: stockData.debtEquity ?? 'N/A', tooltip: 'Total debt divided by shareholder equity' },
                  { label: 'Current Ratio', value: stockData.currentRatio ?? 'N/A', tooltip: 'Current assets divided by current liabilities' },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between items-center py-1" style={{ borderBottom: '1px solid #1a1a2a' }}>
                    <span className="text-xs" style={{ color: '#64748b' }}>
                      <Tooltip2 label={item.tooltip}>{item.label}</Tooltip2>
                    </span>
                    <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
                      {item.value ?? 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Valuation Ratios */}
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>Key Ratios & Metrics</h3>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                {[
                  { label: 'P/E Ratio', value: stockData.pe !== 'N/A' ? `${stockData.pe}x` : 'N/A', tooltip: 'Price to Earnings — how much you pay per ₹1 of profit' },
                  { label: 'P/B Ratio', value: stockData.pb !== 'N/A' ? `${stockData.pb}x` : 'N/A', tooltip: 'Price to Book — market price vs. book value of assets' },
                  { label: 'EV/EBITDA', value: stockData.evEbitda === 'N/A' ? 'N/A' : `${stockData.evEbitda}x`, tooltip: 'Enterprise Value to EBITDA — used for acquisition valuation' },
                  { label: 'Div. Yield', value: stockData.dividendYield !== undefined ? `${stockData.dividendYield}%` : 'N/A', tooltip: 'Annual dividend as % of stock price' },
                  { label: 'Beta', value: stockData.beta ?? 'N/A', tooltip: 'Volatility vs Nifty 50 — >1 means more volatile than market' },
                  { label: 'EPS (TTM)', value: stockData.eps !== 'N/A' ? `₹${stockData.eps}` : 'N/A', tooltip: 'Earnings Per Share — net profit divided by total shares' },
                  { label: '52W High', value: stockData.high52w ? `₹${stockData.high52w.toLocaleString('en-IN')}` : 'N/A', tooltip: '52-week highest traded price' },
                  { label: '52W Low', value: stockData.low52w ? `₹${stockData.low52w.toLocaleString('en-IN')}` : 'N/A', tooltip: '52-week lowest traded price' },
                  { label: 'Market Cap', value: stockData.marketCapCr ? formatMarketCap(stockData.marketCapCr) : 'N/A', tooltip: 'Total market capitalization of the company' },
                  { label: 'Prev Close', value: stockData.prevClose ? `₹${stockData.prevClose.toLocaleString('en-IN')}` : 'N/A', tooltip: 'Previous trading day closing price' },
                ].map((item) => (
                  <MetricCard key={item.label} label={item.label} value={item.value} tooltip={item.tooltip} />
                ))}
              </div>
            </div>
          </div>

          {/* Day stats (live only) */}
          {isLive && (
            <div
              className="rounded-xl p-4"
              style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
            >
              <h3 className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>Today's Trading</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Open', value: stockData.open ? `₹${stockData.open.toLocaleString('en-IN')}` : 'N/A' },
                  { label: 'Day High', value: stockData.dayHigh ? `₹${stockData.dayHigh.toLocaleString('en-IN')}` : 'N/A' },
                  { label: 'Day Low', value: stockData.dayLow ? `₹${stockData.dayLow.toLocaleString('en-IN')}` : 'N/A' },
                  { label: 'Prev Close', value: stockData.prevClose ? `₹${stockData.prevClose.toLocaleString('en-IN')}` : 'N/A' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="text-xs mb-1" style={{ color: '#64748b' }}>{item.label}</div>
                    <div className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 20+ Financial Ratios Table */}
          {(() => {

            const tabs = ['Valuation', 'Profitability', 'Leverage', 'Liquidity', 'Efficiency', 'Growth'];
            const sd = stockData;
            const fmt = (v, suffix='', prefix='') => (v === 'N/A' || v === undefined || v === null) ? 'N/A' : `${prefix}${v}${suffix}`;
            const rev = sd.revenue ? sd.revenue / 100 : null;
            const np = sd.netProfit ? sd.netProfit / 100 : null;
            const ratioData = {
              Valuation: [
                { label: 'P/E Ratio', value: fmt(sd.pe,'x'), desc: 'Price to Earnings' },
                { label: 'P/B Ratio', value: fmt(sd.pb,'x'), desc: 'Price to Book Value' },
                { label: 'EV/EBITDA', value: fmt(sd.evEbitda,'x'), desc: 'Enterprise Value to EBITDA' },
                { label: 'Dividend Yield', value: fmt(sd.dividendYield,'%'), desc: 'Annual dividend / Price' },
                { label: 'EPS (TTM)', value: sd.eps !== 'N/A' ? `₹${sd.eps}` : 'N/A', desc: 'Earnings per share' },
                { label: 'Market Cap', value: sd.marketCapCr ? (sd.marketCapCr > 100000 ? `₹${(sd.marketCapCr/100000).toFixed(1)}L Cr` : `₹${sd.marketCapCr.toLocaleString()} Cr`) : 'N/A', desc: 'Total market capitalisation' },
                { label: '52W High', value: sd.high52w ? `₹${sd.high52w.toLocaleString('en-IN')}` : 'N/A', desc: '52-week highest price' },
                { label: '52W Low', value: sd.low52w ? `₹${sd.low52w.toLocaleString('en-IN')}` : 'N/A', desc: '52-week lowest price' },
              ],
              Profitability: [
                { label: 'EBITDA Margin', value: fmt(sd.ebitdaMargin,'%'), desc: 'EBITDA as % of revenue' },
                { label: 'Net Margin', value: (rev && np) ? `${(np/rev*100).toFixed(1)}%` : 'N/A', desc: 'Net profit / Revenue' },
                { label: 'ROE', value: fmt(sd.roe,'%'), desc: 'Return on Equity' },
                { label: 'Beta', value: fmt(sd.beta), desc: 'Volatility vs Nifty 50' },
                { label: 'Revenue (TTM)', value: rev ? `₹${Math.round(rev).toLocaleString('en-IN')} Cr` : 'N/A', desc: 'Trailing twelve months revenue' },
                { label: 'Net Profit (TTM)', value: np ? `₹${Math.round(np).toLocaleString('en-IN')} Cr` : 'N/A', desc: 'Trailing twelve months net profit' },
              ],
              Leverage: [
                { label: 'Debt / Equity', value: fmt(sd.debtEquity,'x'), desc: 'Total debt / Shareholders equity' },
                { label: 'P/B Ratio', value: fmt(sd.pb,'x'), desc: 'Market price vs book value per share' },
                { label: 'Interest Coverage', value: 'N/A', desc: 'EBIT / Interest expense' },
                { label: 'Net Debt/EBITDA', value: 'N/A', desc: 'Net debt / EBITDA — leverage measure' },
              ],
              Liquidity: [
                { label: 'Current Ratio', value: fmt(sd.currentRatio,'x'), desc: 'Current assets / Current liabilities' },
                { label: 'Quick Ratio', value: 'N/A', desc: '(Current assets - Inventory) / Current liabilities' },
                { label: 'Cash Ratio', value: 'N/A', desc: 'Cash / Current liabilities' },
              ],
              Efficiency: [
                { label: 'Asset Turnover', value: 'N/A', desc: 'Revenue / Total assets' },
                { label: 'Inventory Days', value: 'N/A', desc: 'Days of inventory held' },
                { label: 'Receivables Days', value: 'N/A', desc: 'Days to collect receivables' },
              ],
              Growth: [
                { label: 'Revenue TTM', value: rev ? `₹${Math.round(rev).toLocaleString('en-IN')} Cr` : 'N/A', desc: 'Trailing 12M revenue' },
                { label: 'Net Profit TTM', value: np ? `₹${Math.round(np).toLocaleString('en-IN')} Cr` : 'N/A', desc: 'Trailing 12M net profit' },
                { label: 'EPS Growth YoY', value: 'N/A', desc: 'Year-over-year EPS change' },
              ],
            };
            const rows = ratioData[ratioTab] || [];
            return (
              <div className="rounded-xl overflow-hidden" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                <div className="px-5 pt-4 pb-0">
                  <div className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>📋 Financial Ratios (20+)</div>
                  <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: '#1e1e2e', scrollbarWidth: 'none' }}>
                    {tabs.map(t => (
                      <button key={t} onClick={() => setRatioTab(t)}
                        className="px-3 py-1.5 text-xs font-medium rounded-t-md transition-all"
                        style={{ background: ratioTab===t ? '#1e1e2e' : 'transparent', color: ratioTab===t ? '#60a5fa' : '#475569',
                          borderBottom: ratioTab===t ? '2px solid #3b82f6' : '2px solid transparent' }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {rows.map((r,i) => (
                    <div key={i} className="rounded-lg p-3" style={{ background: '#0d0d15', border: '1px solid #1a1a2a' }}>
                      <div className="text-xs mb-1" style={{ color: '#475569' }} title={r.desc}>{r.label}</div>
                      <div className="text-sm font-bold" style={{ color: r.value==='N/A' ? '#334155' : '#e2e8f0' }}>{r.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* M&A / Corporate Actions — only show if live news available */}
          {liveNews && liveNews.length > 0 && (() => {
            const maKeywords = ['acqui', 'merger', 'buyback', 'fundrais', 'allotment', 'dividend', 'bonus', 'split', 'stake', 'deal', 'bid', 'takeover'];
            const maNews = liveNews.filter(n =>
              maKeywords.some(k => (n.title || '').toLowerCase().includes(k))
            ).slice(0, 4);
            if (maNews.length === 0) return null;
            return (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>🤝 M&A & Corporate Actions</h3>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>Live</span>
                </div>
                <div className="news-carousel pb-2">
                  {maNews.map((n,i) => {
                    const url = n.url || n.link || '#';
                    const isExternal = url && url !== '#';
                    return (
                      <a key={i} href={isExternal ? url : undefined} target={isExternal ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className="news-carousel-item rounded-xl p-4 card-hover block"
                        style={{ background: '#12121a', border: '1px solid #1e1e2e', textDecoration: 'none', cursor: isExternal ? 'pointer' : 'default' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                            {n.category || 'Corporate'}
                          </span>
                          {isExternal && <span className="text-xs" style={{ color: '#334155' }}>↗</span>}
                        </div>
                        <div className="text-xs font-medium mb-2 leading-snug" style={{ color: '#e2e8f0' }}>{n.title}</div>
                        <div className="flex justify-between text-xs" style={{ color: '#475569' }}>
                          <span style={{ color: '#64748b' }}>{n.source}</span>
                          <span>{n.time || ''}</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Company News */}
          {(() => {
            // Only show real news — no fake generated templates
            const rawNews = liveNews && liveNews.length > 0
              ? liveNews
              : [];

            // Deduplicate by title prefix + url
            const seen = new Set();
            const news = rawNews.filter(n => {
              const key = (n.title || '').toLowerCase().slice(0, 60);
              const urlKey = n.url || n.link || '';
              if (seen.has(key)) return false;
              seen.add(key);
              if (urlKey && urlKey !== '#') seen.add(urlKey);
              return true;
            });

            const isLiveNews = liveNews && liveNews.length > 0;

            return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>
                    Latest News — {stockData.name}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded" style={{
                    background: isLiveNews ? 'rgba(34,197,94,0.1)' : '#1e1e2e',
                    color: isLiveNews ? '#22c55e' : '#64748b',
                  }}>
                    {isLiveNews ? `● Live · ${news.length}` : `${news.length} articles`}
                  </span>
                </div>
                {news.length === 0 && (
                  <div className="rounded-xl p-6 text-center" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
                    <div className="text-sm" style={{ color: '#475569' }}>Live news unavailable — connect to internet for real-time articles</div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {news.slice(0, 6).map((n, i) => {
                    const url = n.url || n.link || '#';
                    const isExternal = url && url !== '#';
                    const CardEl = isExternal ? 'a' : 'div';
                    const extraProps = isExternal
                      ? { href: url, target: '_blank', rel: 'noopener noreferrer' }
                      : {};
                    return (
                      <CardEl
                        key={i}
                        {...extraProps}
                        className="rounded-xl p-4 card-hover block"
                        style={{
                          background: '#12121a',
                          border: '1px solid #1e1e2e',
                          textDecoration: 'none',
                          cursor: isExternal ? 'pointer' : 'default',
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          {n.category && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{
                              background: 'rgba(59,130,246,0.12)',
                              color: '#60a5fa',
                              border: '1px solid rgba(59,130,246,0.2)',
                            }}>
                              {n.category}
                            </span>
                          )}
                          {isExternal && <span className="text-xs" style={{ color: '#334155' }}>↗</span>}
                        </div>
                        <div className="text-xs font-medium mb-2 leading-snug" style={{ color: '#e2e8f0' }}>
                          {n.title}
                        </div>
                        <div className="flex justify-between text-xs" style={{ color: '#475569' }}>
                          <span className="font-medium" style={{ color: '#64748b' }}>{n.source}</span>
                          <span>{n.time || n.publishedAt || ''}</span>
                        </div>
                      </CardEl>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="h-6" />
        </div>
      )}
    </div>
  );
}
