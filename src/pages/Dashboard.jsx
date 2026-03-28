import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MARKET_INDICES, ALL_NIFTY50, MOCK_NEWS } from '../data/mockData.js';
import { formatVolume } from '../utils/formatters.js';
import { fetchIndices, fetchNifty50Quotes, fetchChart, fetchIndiaNews, computeSectorHeatmap } from '../utils/api.js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

function SkeletonBox({ w, h, className }) {
  return <div className={`skeleton rounded ${className || ''}`} style={{ width: w, height: h }} />;
}

function ChartModal({ symbol, label, onClose }) {
  const [data, setData] = useState([]);
  const [range, setRange] = useState('3mo');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetchChart(symbol, range, '1d').then(d => { setData(d || []); setLoading(false); });
  }, [symbol, range]);
  const change = data.length >= 2
    ? ((data[data.length-1].close - data[0].close) / data[0].close) * 100 : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)' }} onClick={onClose}>
      <div className="rounded-2xl p-6" onClick={e => e.stopPropagation()}
        style={{ background: '#12121a', border: '1px solid #1e1e2e', width: 640, maxWidth: '95vw' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-base font-bold" style={{ color: '#f1f5f9' }}>{label}</div>
            {data.length > 0 && <div className="text-sm font-semibold mt-0.5" style={{ color: change >= 0 ? '#22c55e' : '#ef4444' }}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </div>}
          </div>
          <div className="flex items-center gap-2">
            {[['1mo','1M'],['3mo','3M'],['6mo','6M'],['1y','1Y']].map(([r,l]) => (
              <button key={r} onClick={() => setRange(r)} className="px-2 py-1 rounded text-xs font-medium"
                style={{ background: range===r ? '#3b82f6' : '#1e1e2e', color: range===r ? '#fff' : '#64748b' }}>{l}</button>
            ))}
            <button onClick={onClose} className="ml-2 text-sm" style={{ color: '#64748b' }}>✕</button>
          </div>
        </div>
        {loading ? <SkeletonBox w="100%" h={220} className="rounded-xl" /> : data.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 9 }}
                tickFormatter={v => new Date(v).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                interval={Math.floor(data.length/5)} axisLine={{ stroke: '#1e1e2e' }} tickLine={false} />
              <YAxis domain={['auto','auto']} tick={{ fill: '#475569', fontSize: 9 }}
                tickFormatter={v => v.toLocaleString('en-IN')} axisLine={false} tickLine={false} width={60} />
              <Tooltip contentStyle={{ background:'#1e1e2e', border:'1px solid #2d2d45', borderRadius:8, fontSize:11 }}
                labelStyle={{ color:'#94a3b8' }} formatter={v => [v.toLocaleString('en-IN'), 'Value']} />
              <Line type="monotone" dataKey="close" stroke={change>=0 ? '#22c55e' : '#ef4444'} strokeWidth={2} dot={false} activeDot={{ r:3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#475569' }}>
            No chart data — start proxy server for live data
          </div>
        )}
      </div>
    </div>
  );
}

function KPICard({ label, subtitle, badge, value, change, changeLabel, loading, onClick, symbol }) {
  const isNA = value === 'N/A' || value === '—';
  const isPositive = parseFloat(change) >= 0;
  return (
    <div className="rounded-xl p-4 card-hover h-full" onClick={onClick}
      style={{ background: '#12121a', border: '1px solid #1e1e2e', cursor: (symbol && onClick) ? 'pointer' : 'default' }}
      title={symbol && onClick ? `Click to view ${label} chart` : undefined}>
      {loading ? (<><SkeletonBox w="60%" h={10} className="mb-2" /><SkeletonBox w="80%" h={26} className="mb-2" /><SkeletonBox w="40%" h={10} /></>) : (
        <>
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-xs font-medium" style={{ color: '#64748b' }}>{label}</div>
            {badge && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: badge.bg, color: badge.color, fontSize: 9, fontWeight: 600 }}>
                {badge.text}
              </span>
            )}
            {!badge && symbol && onClick && <span className="text-xs" style={{ color: '#334155' }}>📈</span>}
          </div>
          {subtitle && <div className="text-xs mb-1" style={{ color: '#334155', fontSize: 9 }}>{subtitle}</div>}
          <div className="font-bold mb-1" style={{ color: isNA ? '#475569' : '#f1f5f9', fontSize: isNA ? 16 : 22 }}>
            {isNA ? 'Unavailable' : value}
          </div>
          {!isNA && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs font-medium" style={{ color: isPositive ? '#22c55e' : '#ef4444' }}>
                {isPositive ? '▲' : '▼'} {Math.abs(parseFloat(change) || 0).toFixed(2)}%
              </span>
              {changeLabel && <span className="text-xs" style={{ color: '#475569' }}>{changeLabel}</span>}
            </div>
          )}
          {isNA && (
            <div className="text-xs" style={{ color: '#334155' }}>Check NSE IFSC</div>
          )}
        </>
      )}
    </div>
  );
}

function GainersLosersTable({ stocks, type }) {
  return (
    <div className="rounded-xl" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #1e1e2e', borderRadius: '12px 12px 0 0' }}>
        <span className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>{type==='gainers' ? '▲ Top Gainers' : '▼ Top Losers'}</span>
        <span className="text-xs px-2 py-0.5 rounded" style={{ background: type==='gainers' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: type==='gainers' ? '#22c55e' : '#ef4444' }}>Nifty 50</span>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y', borderRadius: '0 0 12px 12px' }}>
      <table style={{ width: '100%', minWidth: 400 }}>
        <thead><tr style={{ borderBottom: '1px solid #1a1a2a' }}>
          {['Stock','Price','Change','Volume'].map(h => (
            <th key={h} className="px-4 py-2 text-left text-xs font-medium" style={{ color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{stocks.map(s => (
          <tr key={s.ticker} className="transition-colors" style={{ borderBottom: '1px solid #12121a' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#161622')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <td className="px-4 py-2" style={{ whiteSpace: 'nowrap' }}><div className="text-sm font-medium" style={{ color: '#e2e8f0' }}>{s.name}</div>
              <div className="text-xs" style={{ color: '#475569' }}>{s.ticker.replace('.NS','')}</div></td>
            <td className="px-4 py-2 text-sm font-medium" style={{ color: '#f1f5f9', whiteSpace: 'nowrap' }}>₹{(s.price||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
            <td className="px-4 py-2" style={{ whiteSpace: 'nowrap' }}><span className="text-sm font-semibold" style={{ color: s.change>=0 ? '#22c55e' : '#ef4444' }}>{s.change>=0?'+':''}{(s.change||0).toFixed(2)}%</span></td>
            <td className="px-4 py-2 text-xs" style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{formatVolume(s.volume)}</td>
          </tr>
        ))}</tbody>
      </table>
      </div>
    </div>
  );
}

function SectorHeatmap({ sectors }) {
  const maxAbs = Math.max(...sectors.map(s => Math.abs(s.change)));
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e1e2e' }}>
        <span className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Sector Heatmap · Live</span>
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2">
        {sectors.map(sector => {
          const intensity = Math.min(Math.abs(sector.change)/maxAbs, 1);
          const isPos = sector.change >= 0;
          const a = 0.08 + intensity * 0.25;
          return (
            <div key={sector.name} className="rounded-lg p-3 flex flex-col items-center gap-1"
              style={{ background: isPos ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`, border: `1px solid ${isPos ? `rgba(34,197,94,${a+0.1})` : `rgba(239,68,68,${a+0.1})`}` }}>
              <span className="text-xs font-semibold" style={{ color: '#e2e8f0' }}>{sector.name}</span>
              <span className="text-sm font-bold" style={{ color: isPos ? '#4ade80' : '#f87171' }}>
                {sector.change>=0?'+':''}{sector.change.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewsCard({ article }) {
  const colors = { Markets:'#3b82f6', Macro:'#8b5cf6', Earnings:'#22c55e', Deals:'#f59e0b', Policy:'#06b6d4', Regulation:'#f97316', Business:'#a78bfa' };
  const color = colors[article.category] || '#64748b';
  const isExternal = article.url && article.url !== '#';
  const Wrapper = ({ children }) => isExternal
    ? <a href={article.url} target="_blank" rel="noopener noreferrer" className="rounded-xl p-4 card-hover flex flex-col gap-2 block" style={{ background: '#12121a', border: '1px solid #1e1e2e', textDecoration: 'none', cursor: 'pointer' }}>{children}</a>
    : <div className="rounded-xl p-4 card-hover flex flex-col gap-2" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>{children}</div>;
  return (
    <Wrapper>
      <div className="flex items-center justify-between">
        <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: `${color}20`, color }}>{article.category}</span>
        <span className="text-xs" style={{ color: '#475569' }}>{article.time}</span>
      </div>
      <p className="text-sm font-medium leading-snug" style={{ color: '#e2e8f0', lineHeight: '1.4' }}>{article.title}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: '#64748b' }}>{article.source}</span>
        {isExternal && <span className="text-xs" style={{ color: '#334155' }}>↗</span>}
      </div>
    </Wrapper>
  );
}

function isMarketOpen() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [indices, setIndices] = useState(MARKET_INDICES);
  const [stocks, setStocks] = useState(ALL_NIFTY50);
  const [sectorData, setSectorData] = useState([]);
  const [isLive, setIsLive] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [chartModal, setChartModal] = useState(null);
  const [news, setNews] = useState(MOCK_NEWS);
  const [newsLive, setNewsLive] = useState(false);
  const mounted = useRef(true);

  const loadData = useCallback(async () => {
    try {
      const [liveIndices, liveStocks] = await Promise.all([fetchIndices(), fetchNifty50Quotes()]);
      if (!mounted.current) return;
      if (liveIndices?.nifty && liveIndices?.sensex) { setIndices(liveIndices); setIsLive(true); }
      if (liveStocks?.length > 0) {
        setStocks(liveStocks);
        const liveSectors = computeSectorHeatmap(liveStocks);
        if (liveSectors && liveSectors.length > 0) setSectorData(liveSectors);
      }
      setLastRefresh(new Date());
    } catch { /* keep existing */ } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const loadNews = useCallback(async () => {
    const liveNews = await fetchIndiaNews();
    if (!mounted.current) return;
    if (liveNews.length > 0) { setNews(liveNews); setNewsLive(true); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadData();
    loadNews();
    const iv = setInterval(loadData, 10000);
    const newsIv = setInterval(loadNews, 2 * 60 * 1000); // refresh news every 2 min
    return () => { mounted.current = false; clearInterval(iv); clearInterval(newsIv); };
  }, [loadData, loadNews]);

  const sorted = [...stocks].sort((a,b) => b.change - a.change);
  const gainers = sorted.slice(0,5);
  const losers = sorted.slice(-5).reverse();
  const fmtT = d => d ? d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';

  return (
    <div className="h-full overflow-y-auto px-4 md:px-6 py-5" style={{ background: '#0a0a0f' }}>
      {chartModal && <ChartModal symbol={chartModal.symbol} label={chartModal.label} onClose={() => setChartModal(null)} />}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded" style={{
            background: isMarketOpen() ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: isMarketOpen() ? '#22c55e' : '#ef4444',
            border: `1px solid ${isMarketOpen() ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>{isMarketOpen() ? '● Market Open' : '● Market Closed'}</span>
          {lastRefresh && <span className="text-xs" style={{ color: '#334155' }}>Refreshed {fmtT(lastRefresh)}</span>}
        </div>
        <span className="text-xs px-2 py-1 rounded" style={{
          background: isLive ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
          color: isLive ? '#4ade80' : '#64748b', border: `1px solid ${isLive ? 'rgba(34,197,94,0.2)' : '#1e1e2e'}`,
        }}>{isLive ? '● Live (10s refresh)' : '● Mock Data'}</span>
      </div>

      {/* KPI cards — equal 5-col grid on desktop, horizontal scroll on mobile */}
      <div className="mb-5">
        {/* Desktop: equal grid */}
        <div className="hidden md:grid gap-3" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <KPICard label="Nifty 50" subtitle="NSE · Spot" symbol="^NSEI"
            value={loading ? '—' : (indices.nifty?.value??0).toLocaleString('en-IN',{minimumFractionDigits:2})}
            change={indices.nifty?.change??0}
            changeLabel={`(${(indices.nifty?.points??0)>=0?'+':''}${(indices.nifty?.points??0).toFixed(2)} pts)`}
            loading={loading} onClick={() => setChartModal({symbol:'^NSEI',label:'Nifty 50'})} />
          <KPICard label="Sensex" subtitle="BSE · Spot" symbol="^BSESN"
            value={loading ? '—' : (indices.sensex?.value??0).toLocaleString('en-IN',{minimumFractionDigits:2})}
            change={indices.sensex?.change??0}
            changeLabel={`(${(indices.sensex?.points??0)>=0?'+':''}${(indices.sensex?.points??0).toFixed(2)} pts)`}
            loading={loading} onClick={() => setChartModal({symbol:'^BSESN',label:'Sensex'})} />
          <KPICard label="GIFT Nifty" subtitle="NSE IFSC · Futures"
            badge={indices.giftNifty
              ? { text: '● LIVE', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' }
              : { text: 'FUTURES', bg: 'rgba(99,102,241,0.12)', color: '#818cf8' }}
            value={loading ? '—' : (indices.giftNifty
              ? (indices.giftNifty.value??0).toLocaleString('en-IN',{minimumFractionDigits:2})
              : 'N/A')}
            change={indices.giftNifty?.change??0}
            changeLabel={indices.giftNifty
              ? `(${(indices.giftNifty.points??0)>=0?'+':''}${(indices.giftNifty.points??0).toFixed(2)} pts)`
              : ''}
            loading={loading} />
          <KPICard label="India VIX" subtitle="Volatility" symbol="^INDIAVIX"
            value={loading ? '—' : (indices.vix?.value??0).toFixed(2)}
            change={indices.vix?.change??0} loading={loading}
            onClick={() => setChartModal({symbol:'^INDIAVIX',label:'India VIX'})} />
          <KPICard label="USD / INR" subtitle="Forex" symbol="USDINR=X"
            value={loading ? '—' : `₹${(indices.usdinr?.value??0).toFixed(2)}`}
            change={indices.usdinr?.change??0} loading={loading}
            onClick={() => setChartModal({symbol:'USDINR=X',label:'USD / INR'})} />
        </div>
        {/* Mobile: horizontal scroll */}
        <div className="md:hidden" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y', paddingBottom: 4 }}>
          <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
            {[
              { label:'Nifty 50', subtitle:'NSE · Spot', symbol:'^NSEI', value:loading?'—':(indices.nifty?.value??0).toLocaleString('en-IN',{minimumFractionDigits:2}), change:indices.nifty?.change??0, changeLabel:`(${(indices.nifty?.points??0)>=0?'+':''}${(indices.nifty?.points??0).toFixed(2)} pts)`, onClick:() => setChartModal({symbol:'^NSEI',label:'Nifty 50'}) },
              { label:'Sensex', subtitle:'BSE · Spot', symbol:'^BSESN', value:loading?'—':(indices.sensex?.value??0).toLocaleString('en-IN',{minimumFractionDigits:2}), change:indices.sensex?.change??0, changeLabel:`(${(indices.sensex?.points??0)>=0?'+':''}${(indices.sensex?.points??0).toFixed(2)} pts)`, onClick:() => setChartModal({symbol:'^BSESN',label:'Sensex'}) },
              { label:'GIFT Nifty', subtitle:'NSE IFSC · Futures', badge:indices.giftNifty?{text:'● LIVE',bg:'rgba(34,197,94,0.12)',color:'#22c55e'}:{text:'FUTURES',bg:'rgba(99,102,241,0.12)',color:'#818cf8'}, value:loading?'—':(indices.giftNifty?(indices.giftNifty.value??0).toLocaleString('en-IN',{minimumFractionDigits:2}):'N/A'), change:indices.giftNifty?.change??0, changeLabel:indices.giftNifty?`(${(indices.giftNifty.points??0)>=0?'+':''}${(indices.giftNifty.points??0).toFixed(2)} pts)`:'' },
              { label:'India VIX', subtitle:'Volatility', symbol:'^INDIAVIX', value:loading?'—':(indices.vix?.value??0).toFixed(2), change:indices.vix?.change??0, onClick:() => setChartModal({symbol:'^INDIAVIX',label:'India VIX'}) },
              { label:'USD / INR', subtitle:'Forex', symbol:'USDINR=X', value:loading?'—':`₹${(indices.usdinr?.value??0).toFixed(2)}`, change:indices.usdinr?.change??0, onClick:() => setChartModal({symbol:'USDINR=X',label:'USD / INR'}) },
            ].map((p, i) => <div key={i} style={{ width: 150 }}><KPICard {...p} loading={loading} /></div>)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {loading ? (<><SkeletonBox w="100%" h={220} className="rounded-xl" /><SkeletonBox w="100%" h={220} className="rounded-xl" /></>) : (
          <><GainersLosersTable stocks={gainers} type="gainers" /><GainersLosersTable stocks={losers} type="losers" /></>
        )}
      </div>

      <div className="mb-5">
        {loading ? <SkeletonBox w="100%" h={130} className="rounded-xl" /> : sectorData.length > 0 ? <SectorHeatmap sectors={sectorData} /> : null}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold" style={{ color: '#94a3b8' }}>Indian Market News</h2>
            {newsLive && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>● Live</span>
            )}
          </div>
          <span className="text-xs" style={{ color: '#334155' }}>
            {newsLive ? 'ET · MC · NDTV · Mint · BS' : 'Mock data'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? Array(6).fill(0).map((_,i) => <SkeletonBox key={i} w="100%" h={110} className="rounded-xl" />)
            : news.slice(0, 6).map((a, i) => <NewsCard key={a.id || i} article={a} />)}
        </div>
        {newsLive && news.length > 6 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {news.slice(6, 12).map((a, i) => <NewsCard key={`more-${a.id || i}`} article={a} />)}
          </div>
        )}
      </div>
      <div className="h-6" />
    </div>
  );
}
