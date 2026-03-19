import React, { useState, useEffect } from 'react';

const DEFAULT_KEYS = {
  fmp_api_key: '4csJHhT1Qn74tSp6IZjrMGGAyk8jU3Qs',
};

function APIKeyInput({ label, keyName, description, placeholder }) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(keyName) || DEFAULT_KEYS[keyName] || '';
    // Auto-save the default key to localStorage so it shows as Active
    if (!localStorage.getItem(keyName) && DEFAULT_KEYS[keyName]) {
      localStorage.setItem(keyName, DEFAULT_KEYS[keyName]);
    }
    setValue(stored);
  }, [keyName]);

  const save = () => {
    localStorage.setItem(keyName, value.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const clear = () => { localStorage.removeItem(keyName); setValue(''); };

  return (
    <div className="rounded-xl p-5" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
      <div className="flex items-start justify-between mb-1">
        <div className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>{label}</div>
        {localStorage.getItem(keyName) && (
          <span className="text-xs px-2 py-0.5 rounded" style={{ background:'rgba(34,197,94,0.1)', color:'#22c55e', border:'1px solid rgba(34,197,94,0.2)' }}>● Active</span>
        )}
      </div>
      <div className="text-xs mb-3" style={{ color: '#64748b' }}>{description}</div>
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background:'#0d0d15', border:'1px solid #1e1e2e' }}>
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#e2e8f0' }}
          />
          <button onClick={() => setShow(s => !s)} className="text-xs" style={{ color: '#475569' }}>
            {show ? '🙈' : '👁'}
          </button>
        </div>
        <button onClick={save} className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{ background: saved ? 'rgba(34,197,94,0.2)' : '#3b82f6', color: saved ? '#22c55e' : '#fff' }}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
        {value && <button onClick={clear} className="px-3 py-2 rounded-lg text-xs" style={{ background:'#1e1e2e', color:'#64748b' }}>Clear</button>}
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="h-full overflow-y-auto px-6 py-5" style={{ background: '#0a0a0f' }}>
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-1" style={{ color: '#f1f5f9' }}>⚙ Settings & API Keys</h2>
        <p className="text-sm" style={{ color: '#64748b' }}>
          Configure your API keys to enable live AI reports, advanced fundamentals, and real-time news.
          Keys are stored locally in your browser — never sent to any server.
        </p>
      </div>

      <div className="space-y-4 mb-8">
        <APIKeyInput
          label="Anthropic API Key"
          keyName="anthropic_api_key"
          description="Required for live AI research reports. Get a free key at console.anthropic.com"
          placeholder="sk-ant-..."
        />
        <APIKeyInput
          label="Financial Modeling Prep (FMP) API Key"
          keyName="fmp_api_key"
          description="Enables 20+ financial ratios, income statements, and detailed fundamentals. Free tier: 250 req/day. Get key at financialmodelingprep.com"
          placeholder="Your FMP API key..."
        />
        <APIKeyInput
          label="Finnhub API Key"
          keyName="finnhub_api_key"
          description="Powers real-time company news and market news feeds. Free tier: 60 req/min. Get key at finnhub.io"
          placeholder="Your Finnhub API key..."
        />
      </div>

      <div className="rounded-xl p-5" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
        <div className="text-sm font-semibold mb-3" style={{ color: '#f1f5f9' }}>📊 Data Sources</div>
        <div className="space-y-2">
          {[
            { name: 'Yahoo Finance', status: 'Always Active', desc: 'Live quotes, charts, fundamentals — 15-20 min delayed. No key needed.', color: '#22c55e' },
            { name: 'Screener.in', status: 'Always Active', desc: 'TTM financials for Indian stocks (Revenue, EBITDA, EPS). No key needed.', color: '#22c55e' },
            { name: 'Anthropic Claude', status: 'API Key Required', desc: 'AI-powered equity research reports with deep fundamental analysis.', color: '#f59e0b' },
            { name: 'Financial Modeling Prep', status: 'Built-in Key', desc: '200+ financial ratios, income statements, cash flow, balance sheet data. Default key included.', color: '#22c55e' },
            { name: 'Finnhub', status: 'API Key Required', desc: 'Real-time company news, market news, sentiment scores.', color: '#f59e0b' },
            { name: 'Indian News RSS', status: 'Always Active', desc: 'Live news from Economic Times, Moneycontrol, NDTV Profit, LiveMint, Business Standard. No key needed.', color: '#22c55e' },
          ].map(s => (
            <div key={s.name} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #1a1a2a' }}>
              <div>
                <div className="text-sm font-medium" style={{ color: '#e2e8f0' }}>{s.name}</div>
                <div className="text-xs" style={{ color: '#475569' }}>{s.desc}</div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded whitespace-nowrap ml-4"
                style={{ background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}30` }}>
                {s.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)' }}>
        <div className="text-xs" style={{ color: '#60a5fa' }}>
          💡 <strong>Tip:</strong> For the best experience, add all three API keys. The site works without any keys using comprehensive mock data, Yahoo Finance's free tier, and live Indian news RSS feeds (ET, Moneycontrol, NDTV Profit, LiveMint, Business Standard).
        </div>
      </div>
      <div className="h-6" />
    </div>
  );
}
