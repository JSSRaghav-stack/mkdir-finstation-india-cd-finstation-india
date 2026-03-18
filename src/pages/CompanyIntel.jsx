import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { STOCK_LIST, DETAILED_STOCK_DATA } from '../data/mockData.js';
import { formatMarketCap, formatPrice, formatPct, formatMultiple, formatCr } from '../utils/formatters.js';

const RANGE_OPTIONS = [
  { label: '1M', days: 21 },
  { label: '3M', days: 63 },
  { label: '6M', days: 126 },
  { label: '1Y', days: 252 },
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

function MetricCard({ label, value, sub, tooltip }) {
  return (
    <div
      className="rounded-lg p-3 card-hover"
      style={{ background: '#0d0d15', border: '1px solid #1e1e2e' }}
    >
      <div className="text-xs mb-1" style={{ color: '#64748b' }}>
        {tooltip ? <Tooltip2 label={tooltip}>{label}</Tooltip2> : label}
      </div>
      <div className="text-lg font-bold" style={{ color: '#f1f5f9' }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: '#475569' }}>{sub}</div>}
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
  const [selected, setSelected] = useState(null);
  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState('1Y');
  const inputRef = useRef(null);

  const filtered = STOCK_LIST.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.ticker.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (stock) => {
    setSelected(stock);
    setQuery(stock.name);
    setShowDropdown(false);
    setLoading(true);
    setStockData(null);
    setTimeout(() => {
      const data = DETAILED_STOCK_DATA[stock.ticker];
      setStockData(data || null);
      setLoading(false);
    }, 900);
  };

  const chartData = stockData
    ? (() => {
        const days = RANGE_OPTIONS.find((r) => r.label === range)?.days || 252;
        return stockData.priceHistory.slice(-days);
      })()
    : [];

  const priceChange =
    chartData.length >= 2
      ? ((chartData[chartData.length - 1].close - chartData[0].close) / chartData[0].close) * 100
      : 0;

  return (
    <div className="h-full overflow-y-auto px-6 py-5" style={{ background: '#0a0a0f' }}>
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
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            placeholder="Search NSE stocks — e.g. Reliance, TCS, HDFC..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#e2e8f0' }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setSelected(null); setStockData(null); }}
              className="text-xs"
              style={{ color: '#475569' }}
            >
              ✕
            </button>
          )}
        </div>
        {showDropdown && query && filtered.length > 0 && (
          <div
            className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden"
            style={{ background: '#12121a', border: '1px solid #1e1e2e', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
          >
            {filtered.map((s) => (
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
          <div className="grid grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => <Skeleton key={i} w="100%" h={80} className="rounded-xl" />)}
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
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl font-bold" style={{ color: '#f1f5f9' }}>{stockData.name}</h2>
                  <span
                    className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}
                  >
                    {stockData.ticker.replace('.NS', '')} • {stockData.exchange}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ background: '#1e1e2e', color: '#94a3b8' }}
                  >
                    {stockData.sector}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold" style={{ color: '#f1f5f9' }}>
                    ₹{stockData.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{ color: priceChange >= 0 ? '#22c55e' : '#ef4444' }}
                  >
                    {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}% (1Y)
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>Market Cap</div>
                  <div className="font-semibold" style={{ color: '#e2e8f0' }}>
                    {formatMarketCap(stockData.marketCapCr)}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>P/E Ratio</div>
                  <div className="font-semibold" style={{ color: '#e2e8f0' }}>{stockData.pe}x</div>
                </div>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>52W High</div>
                  <div className="font-semibold" style={{ color: '#22c55e' }}>
                    ₹{stockData.high52w.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>52W Low</div>
                  <div className="font-semibold" style={{ color: '#ef4444' }}>
                    ₹{stockData.low52w.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>EPS (TTM)</div>
                  <div className="font-semibold" style={{ color: '#e2e8f0' }}>₹{stockData.eps}</div>
                </div>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: '#64748b' }}>Beta</div>
                  <div className="font-semibold" style={{ color: '#e2e8f0' }}>{stockData.beta}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Price chart */}
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
                    onClick={() => setRange(r.label)}
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
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                  }}
                  tick={{ fill: '#475569', fontSize: 10 }}
                  interval={Math.floor(chartData.length / 6)}
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

          {/* Financials grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Key Financials */}
            <div
              className="rounded-xl p-5"
              style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
            >
              <h3 className="text-sm font-semibold mb-4" style={{ color: '#f1f5f9' }}>Key Financials (TTM)</h3>
              <div className="space-y-3">
                {[
                  { label: 'Revenue', value: `₹${(stockData.revenue / 100).toFixed(0)} Cr`, tooltip: 'Total revenue for trailing twelve months' },
                  { label: 'Net Profit', value: `₹${(stockData.netProfit / 100).toFixed(0)} Cr`, tooltip: 'Profit after all expenses and taxes' },
                  { label: 'EBITDA Margin', value: typeof stockData.ebitdaMargin === 'number' ? `${stockData.ebitdaMargin}%` : 'N/A', tooltip: 'Earnings before interest, tax, depreciation & amortization as % of revenue' },
                  { label: 'Return on Equity', value: `${stockData.roe}%`, tooltip: 'Net profit as % of shareholder equity' },
                  { label: 'Debt / Equity', value: stockData.debtEquity, tooltip: 'Total debt divided by shareholder equity' },
                  { label: 'Current Ratio', value: stockData.currentRatio, tooltip: 'Current assets divided by current liabilities' },
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
              <h3 className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>Valuation Ratios</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'P/E Ratio', value: `${stockData.pe}x`, tooltip: 'Price to earnings ratio' },
                  { label: 'P/B Ratio', value: `${stockData.pb}x`, tooltip: 'Price to book value ratio' },
                  { label: 'EV/EBITDA', value: stockData.evEbitda === 'N/A' ? 'N/A' : `${stockData.evEbitda}x`, tooltip: 'Enterprise Value to EBITDA multiple' },
                  { label: 'Div. Yield', value: `${stockData.dividendYield}%`, tooltip: 'Annual dividend as % of stock price' },
                  { label: 'Beta', value: stockData.beta, tooltip: 'Volatility relative to Nifty 50' },
                  { label: 'EPS (TTM)', value: `₹${stockData.eps}`, tooltip: 'Earnings per share for trailing twelve months' },
                ].map((item) => (
                  <MetricCard key={item.label} label={item.label} value={item.value} tooltip={item.tooltip} />
                ))}
              </div>
            </div>
          </div>

          {/* Stock news */}
          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>
              Recent News — {stockData.name}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {stockData.news.map((n, i) => (
                <div
                  key={i}
                  className="rounded-xl p-4 card-hover"
                  style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
                >
                  <div className="text-sm font-medium mb-2 leading-snug" style={{ color: '#e2e8f0' }}>
                    {n.title}
                  </div>
                  <div className="flex justify-between text-xs" style={{ color: '#475569' }}>
                    <span>{n.source}</span>
                    <span>{n.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="h-6" />
        </div>
      )}
    </div>
  );
}
