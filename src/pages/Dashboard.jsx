import React, { useEffect, useState } from 'react';
import { MARKET_INDICES, ALL_NIFTY50, SECTOR_DATA, MOCK_NEWS } from '../data/mockData.js';
import { formatVolume } from '../utils/formatters.js';
import { fetchIndices, fetchNifty50Quotes } from '../utils/api.js';

function SkeletonBox({ w, h, className }) {
  return (
    <div
      className={`skeleton rounded ${className || ''}`}
      style={{ width: w, height: h }}
    />
  );
}

function KPICard({ label, value, change, changeLabel, loading }) {
  const isPositive = parseFloat(change) >= 0;
  return (
    <div
      className="flex-1 rounded-xl p-4 card-hover"
      style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
    >
      {loading ? (
        <>
          <SkeletonBox w="60%" h={12} className="mb-2" />
          <SkeletonBox w="80%" h={28} className="mb-2" />
          <SkeletonBox w="40%" h={12} />
        </>
      ) : (
        <>
          <div className="text-xs font-medium mb-1" style={{ color: '#64748b' }}>{label}</div>
          <div className="text-2xl font-bold mb-1" style={{ color: '#f1f5f9' }}>{value}</div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium" style={{ color: isPositive ? '#22c55e' : '#ef4444' }}>
              {isPositive ? '▲' : '▼'} {Math.abs(parseFloat(change)).toFixed(2)}%
            </span>
            {changeLabel && (
              <span className="text-xs" style={{ color: '#475569' }}>{changeLabel}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function GainersLosersTable({ stocks, type }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid #1e1e2e' }}
      >
        <span className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>
          {type === 'gainers' ? '📈 Top Gainers' : '📉 Top Losers'}
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded"
          style={{
            background: type === 'gainers' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: type === 'gainers' ? '#22c55e' : '#ef4444',
          }}
        >
          Nifty 50
        </span>
      </div>
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid #1a1a2a' }}>
            {['Stock', 'Price', 'Change', 'Volume'].map((h) => (
              <th key={h} className="px-4 py-2 text-left text-xs font-medium" style={{ color: '#475569' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => (
            <tr
              key={s.ticker}
              className="transition-colors"
              style={{ borderBottom: '1px solid #12121a' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#161622')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <td className="px-4 py-2">
                <div className="text-sm font-medium" style={{ color: '#e2e8f0' }}>{s.name}</div>
                <div className="text-xs" style={{ color: '#475569' }}>{s.ticker.replace('.NS', '')}</div>
              </td>
              <td className="px-4 py-2 text-sm font-medium" style={{ color: '#f1f5f9' }}>
                ₹{s.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-2">
                <span
                  className="text-sm font-semibold"
                  style={{ color: s.change >= 0 ? '#22c55e' : '#ef4444' }}
                >
                  {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                </span>
              </td>
              <td className="px-4 py-2 text-xs" style={{ color: '#64748b' }}>
                {formatVolume(s.volume)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectorHeatmap({ sectors }) {
  const maxAbs = Math.max(...sectors.map((s) => Math.abs(s.change)));
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
    >
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e1e2e' }}>
        <span className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>🗺 Sector Heatmap</span>
      </div>
      <div className="p-4 grid grid-cols-4 gap-2">
        {sectors.map((sector) => {
          const intensity = Math.min(Math.abs(sector.change) / maxAbs, 1);
          const isPositive = sector.change >= 0;
          const bgAlpha = 0.08 + intensity * 0.25;
          const bg = isPositive
            ? `rgba(34,197,94,${bgAlpha})`
            : `rgba(239,68,68,${bgAlpha})`;
          const border = isPositive
            ? `rgba(34,197,94,${bgAlpha + 0.1})`
            : `rgba(239,68,68,${bgAlpha + 0.1})`;
          const textColor = isPositive ? '#4ade80' : '#f87171';
          return (
            <div
              key={sector.name}
              className="rounded-lg p-3 flex flex-col items-center gap-1"
              style={{ background: bg, border: `1px solid ${border}`, cursor: 'default' }}
            >
              <span className="text-xs font-semibold" style={{ color: '#e2e8f0' }}>{sector.name}</span>
              <span className="text-sm font-bold" style={{ color: textColor }}>
                {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewsCard({ article }) {
  const categoryColors = {
    Markets: '#3b82f6',
    Macro: '#8b5cf6',
    Earnings: '#22c55e',
    Deals: '#f59e0b',
    Policy: '#06b6d4',
    Regulation: '#f97316',
  };
  const color = categoryColors[article.category] || '#64748b';
  return (
    <div
      className="rounded-xl p-4 card-hover flex flex-col gap-2"
      style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-xs px-2 py-0.5 rounded font-medium"
          style={{ background: `${color}20`, color }}
        >
          {article.category}
        </span>
        <span className="text-xs" style={{ color: '#475569' }}>{article.time}</span>
      </div>
      <p className="text-sm font-medium leading-snug" style={{ color: '#e2e8f0', lineHeight: '1.4' }}>
        {article.title}
      </p>
      <div className="text-xs" style={{ color: '#64748b' }}>{article.source}</div>
    </div>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [indices, setIndices] = useState(MARKET_INDICES);
  const [stocks, setStocks] = useState(ALL_NIFTY50);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [liveIndices, liveStocks] = await Promise.all([
          fetchIndices(),
          fetchNifty50Quotes(),
        ]);

        if (cancelled) return;

        if (liveIndices && liveIndices.nifty && liveIndices.sensex) {
          setIndices(liveIndices);
          setIsLive(true);
        }
        if (liveStocks && liveStocks.length > 0) {
          setStocks(liveStocks);
        }
      } catch {
        // fall back to mock data — already set as default state
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  const sorted = [...stocks].sort((a, b) => b.change - a.change);
  const gainers = sorted.slice(0, 5);
  const losers = sorted.slice(-5).reverse();

  return (
    <div className="h-full overflow-y-auto px-6 py-5" style={{ background: '#0a0a0f' }}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div />
        <span
          className="text-xs px-2 py-1 rounded"
          style={{
            background: isLive ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
            color: isLive ? '#4ade80' : '#64748b',
            border: `1px solid ${isLive ? 'rgba(34,197,94,0.2)' : '#1e1e2e'}`,
          }}
        >
          {isLive ? '● Live Data' : '● Mock Data'}
        </span>
      </div>

      {/* KPI Row */}
      <div className="flex gap-4 mb-5">
        <KPICard
          label="Nifty 50"
          value={loading ? '—' : (indices.nifty?.value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          change={indices.nifty?.change ?? 0}
          changeLabel={`(${(indices.nifty?.points ?? 0) >= 0 ? '+' : ''}${(indices.nifty?.points ?? 0).toFixed(2)} pts)`}
          loading={loading}
        />
        <KPICard
          label="Sensex"
          value={loading ? '—' : (indices.sensex?.value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          change={indices.sensex?.change ?? 0}
          changeLabel={`(${(indices.sensex?.points ?? 0) >= 0 ? '+' : ''}${(indices.sensex?.points ?? 0).toFixed(2)} pts)`}
          loading={loading}
        />
        <KPICard
          label="India VIX"
          value={loading ? '—' : (indices.vix?.value ?? 0).toFixed(2)}
          change={indices.vix?.change ?? 0}
          loading={loading}
        />
        <KPICard
          label="USD / INR"
          value={loading ? '—' : `₹${(indices.usdinr?.value ?? 0).toFixed(2)}`}
          change={indices.usdinr?.change ?? 0}
          loading={loading}
        />
      </div>

      {/* Gainers / Losers */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {loading ? (
          <>
            <SkeletonBox w="100%" h={220} className="rounded-xl" />
            <SkeletonBox w="100%" h={220} className="rounded-xl" />
          </>
        ) : (
          <>
            <GainersLosersTable stocks={gainers} type="gainers" />
            <GainersLosersTable stocks={losers} type="losers" />
          </>
        )}
      </div>

      {/* Sector Heatmap */}
      <div className="mb-5">
        {loading ? (
          <SkeletonBox w="100%" h={130} className="rounded-xl" />
        ) : (
          <SectorHeatmap sectors={SECTOR_DATA} />
        )}
      </div>

      {/* News Feed */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: '#94a3b8' }}>
            📰 Market News
          </h2>
          <span className="text-xs" style={{ color: '#334155' }}>Updated 5 min ago</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {loading
            ? Array(6)
                .fill(0)
                .map((_, i) => <SkeletonBox key={i} w="100%" h={110} className="rounded-xl" />)
            : MOCK_NEWS.map((article) => <NewsCard key={article.id} article={article} />)}
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}
