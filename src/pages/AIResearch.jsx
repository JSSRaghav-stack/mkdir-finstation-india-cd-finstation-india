import React, { useState } from 'react';
import { STOCK_LIST } from '../data/mockData.js';

const REPORT_TYPES = ['Quick Note', 'Full Report'];
const STANCES = ['Neutral', 'Bull Case', 'Bear Case'];

const STANCE_COLORS = {
  Neutral: '#3b82f6',
  'Bull Case': '#22c55e',
  'Bear Case': '#ef4444',
};

const LOADING_MESSAGES = [
  'Connecting to AI analyst...',
  'Analyzing financial statements...',
  'Synthesizing market data...',
  'Benchmarking against sector peers...',
  'Computing valuation metrics...',
  'Writing research report...',
  'Finalizing recommendations...',
];

function MarkdownRenderer({ text }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // H2/H3 headings
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-base font-bold mt-5 mb-2 pb-1" style={{ color: '#60a5fa', borderBottom: '1px solid #1e2a4a' }}>
          {line.replace(/^##\s*/, '')}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-sm font-bold mt-4 mb-1" style={{ color: '#93c5fd' }}>
          {line.replace(/^###\s*/, '')}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-lg font-extrabold mt-2 mb-3" style={{ color: '#3b82f6' }}>
          {line.replace(/^#\s*/, '')}
        </h1>
      );
    } else if (line.startsWith('**') && line.endsWith('**')) {
      // Bold standalone line (used as section headers sometimes)
      elements.push(
        <p key={i} className="text-sm font-bold mt-3 mb-1" style={{ color: '#a5b4fc' }}>
          {line.replace(/\*\*/g, '')}
        </p>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex gap-2 ml-2 mb-1">
          <span style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }}>•</span>
          <span className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>
            {renderInline(line.replace(/^[-*]\s*/, ''))}
          </span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm leading-relaxed mb-1" style={{ color: '#cbd5e1' }}>
          {renderInline(line)}
        </p>
      );
    }
    i++;
  }

  return <div className="report-body">{elements}</div>;
}

function renderInline(text) {
  // Parse bold, numbers in ₹, percentages
  const parts = text.split(/(\*\*[^*]+\*\*|₹[\d,]+(?:\.\d+)?(?:\s*(?:Cr|L|Lakh|crore))?|[\d.]+%)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} style={{ color: '#e2e8f0' }}>{part.replace(/\*\*/g, '')}</strong>;
    }
    if (part.startsWith('₹')) {
      return <span key={idx} className="font-semibold" style={{ color: '#fbbf24' }}>{part}</span>;
    }
    if (part.endsWith('%')) {
      return <span key={idx} className="font-medium" style={{ color: '#a78bfa' }}>{part}</span>;
    }
    return part;
  });
}

// Demo report for when API key is missing or call fails
function getDemoReport(stockName, reportType, stance) {
  return `# Equity Research Report: ${stockName}

## Investment Summary

**Rating: ${stance === 'Bull Case' ? 'BUY' : stance === 'Bear Case' ? 'SELL' : 'HOLD'}** | Target Price: ₹${Math.floor(Math.random() * 500 + 2500)} | CMP: ₹2,847

${stockName} presents a compelling ${stance === 'Bull Case' ? 'investment opportunity' : stance === 'Bear Case' ? 'downside risk' : 'investment case'} over a 12-month horizon. The company's diversified business model, strong execution track record, and expanding addressable markets underpin our **${stance === 'Bull Case' ? 'BUY' : stance === 'Bear Case' ? 'SELL' : 'HOLD'}** recommendation.

## Company Overview

${stockName} is one of India's premier conglomerates, operating across high-growth verticals including digital services, retail, and energy. The company's competitive moat derives from:

- **Scale advantages** in procurement and distribution across ₹9,41,000 Cr revenue base
- **Ecosystem integration** creating high switching costs across its 500M+ subscriber base
- **Capital allocation discipline** with ROCE consistently above 13% over 5 years

## Financial Performance

Revenue has compounded at **12.4% CAGR** over the past 3 years, driven by strong volume growth in digital and retail segments. Key metrics:

- Revenue (FY26E): ₹10,23,000 Cr (+8.7% YoY)
- EBITDA Margin: 17.2% (expanding 80bps YoY on operating leverage)
- Net Profit: ₹72,500 Cr (+18.4% YoY)
- Return on Equity: 10.8% (sector average: 12%)
- Net Debt/EBITDA: 0.8x (comfortable leverage)

## Valuation

At the current price of ₹2,847, the stock trades at **28.4x FY26E EPS** vs. sector average of 24x, a 18% premium justified by its superior growth trajectory. Our DCF-implied target of ₹3,200 suggests **12% upside** from current levels.

- P/E (FY26E): 28.4x vs. peer median 24.0x
- EV/EBITDA: 14.2x (5-year mean: 13.5x, slight premium)
- DCF Fair Value: ₹3,150–3,250 (WACC: 11.5%, terminal growth: 4%)

## Key Catalysts

- **Jio monetization acceleration**: ARPU expansion to ₹220+ as 5G upgrades drive premium plan adoption
- **Retail EBITDA breakeven**: New Commerce segment approaching profitability in H1 FY27
- **Green energy capex optionality**: ₹75,000 Cr solar/hydrogen investments position company for ESG re-rating

## Key Risks

- **Regulatory risk**: TRAI tariff intervention could cap Jio ARPU expansion
- **Capex intensity**: ₹1.5L Cr committed capex over FY25-27 may pressure free cash flow
- **Succession uncertainty**: Transition of leadership at key business units remains an overhang

## Conclusion

${stockName} remains a core holding for long-term India equity portfolios. ${stance === 'Bull Case' ? 'The risk-reward is attractive at current valuations with multiple earnings catalysts on the horizon. We initiate with a BUY rating and a 12-month target price of ₹3,200.' : stance === 'Bear Case' ? 'However, elevated valuations and near-term execution challenges warrant caution. We maintain a SELL rating with a 12-month target of ₹2,400 implying 16% downside.' : 'While the long-term thesis remains intact, near-term valuations appear fair. We maintain a HOLD with a target of ₹2,950, implying 4% upside.'} Investors should use dips towards ₹2,600 as accumulation opportunities.

---
*This report is for informational purposes only and does not constitute investment advice.*`;
}

export default function AIResearch() {
  const [selectedStock, setSelectedStock] = useState('');
  const [reportType, setReportType] = useState('Full Report');
  const [stance, setStance] = useState('Neutral');
  const [apiKey, setApiKey] = useState('');
  const [showApiInput, setShowApiInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [report, setReport] = useState('');
  const [reportMeta, setReportMeta] = useState(null);
  const [error, setError] = useState('');

  const msgCycleRef = React.useRef(null);

  const startLoadingMessages = () => {
    let idx = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    msgCycleRef.current = setInterval(() => {
      idx = (idx + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[idx]);
    }, 1800);
  };

  const stopLoadingMessages = () => {
    if (msgCycleRef.current) clearInterval(msgCycleRef.current);
  };

  const generateReport = async () => {
    if (!selectedStock) {
      setError('Please select a stock first.');
      return;
    }
    setError('');
    setReport('');
    setLoading(true);
    startLoadingMessages();

    const stock = STOCK_LIST.find((s) => s.ticker === selectedStock);
    const stockName = stock?.name || selectedStock;
    const wordCount = reportType === 'Quick Note' ? '500 words' : '1200 words';

    const prompt = `You are a senior equity research analyst at a top Indian investment bank. Write a ${wordCount} ${reportType.toLowerCase()} on ${stockName} listed on NSE India from a ${stance.toLowerCase()} perspective.

Structure the report as:
1. **Investment Summary** (2-3 lines, include a clear BUY/SELL/HOLD rating)
2. **Company Overview** (business model, key segments, competitive moat)
3. **Financial Performance** (revenue growth, margins, return ratios — use realistic estimates for Indian markets)
4. **Valuation** (P/E vs sector average, DCF implied upside/downside, target price)
5. **Key Catalysts** (3 bullet points — what could drive the stock)
6. **Key Risks** (3 bullet points)
7. **Conclusion** (1 paragraph with final recommendation)

Use ₹ for currency. Be specific with numbers. Sound like a real sell-side research note from IIFL, Motilal Oswal, or Kotak Securities.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: reportType === 'Quick Note' ? 800 : 1600,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `API error ${response.status}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      stopLoadingMessages();
      setReport(text);
      setReportMeta({
        stock: stockName,
        type: reportType,
        stance,
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
      });
    } catch (e) {
      stopLoadingMessages();
      // Fallback to demo report if API fails
      const demo = getDemoReport(stockName, reportType, stance);
      setReport(demo);
      setReportMeta({
        stock: stockName,
        type: reportType,
        stance,
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
        isDemo: true,
      });
    }
    setLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(report);
  };

  const handlePrint = () => {
    window.print();
  };

  const stanceColor = STANCE_COLORS[stance];

  return (
    <div className="h-full flex gap-0 overflow-hidden" style={{ background: '#0a0a0f' }}>
      {/* Left panel — controls */}
      <div
        className="flex-shrink-0 flex flex-col gap-4 overflow-y-auto px-5 py-5"
        style={{ width: 300, background: '#0d0d15', borderRight: '1px solid #1e1e2e' }}
      >
        <div>
          <h2 className="text-sm font-bold mb-1" style={{ color: '#f1f5f9' }}>AI Research Report</h2>
          <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
            Generate professional equity research notes powered by Claude AI.
          </p>
        </div>

        {/* Stock selector */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: '#94a3b8' }}>
            Select Stock
          </label>
          <select
            value={selectedStock}
            onChange={(e) => setSelectedStock(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: '#12121a', border: '1px solid #1e1e2e', color: '#e2e8f0' }}
          >
            <option value="">— Choose a stock —</option>
            {STOCK_LIST.map((s) => (
              <option key={s.ticker} value={s.ticker}>
                {s.name} ({s.ticker.replace('.NS', '')})
              </option>
            ))}
          </select>
        </div>

        {/* Report type */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: '#94a3b8' }}>
            Report Type
          </label>
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #1e1e2e' }}>
            {REPORT_TYPES.map((rt) => (
              <button
                key={rt}
                onClick={() => setReportType(rt)}
                className="flex-1 py-2 text-xs font-medium transition-all"
                style={{
                  background: reportType === rt ? '#3b82f6' : '#12121a',
                  color: reportType === rt ? '#fff' : '#64748b',
                }}
              >
                {rt}
              </button>
            ))}
          </div>
        </div>

        {/* Stance */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: '#94a3b8' }}>
            Analyst Stance
          </label>
          <div className="flex flex-col gap-2">
            {STANCES.map((s) => {
              const active = stance === s;
              const color = STANCE_COLORS[s];
              return (
                <button
                  key={s}
                  onClick={() => setStance(s)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all"
                  style={{
                    background: active ? `${color}18` : '#12121a',
                    border: `1px solid ${active ? color + '40' : '#1e1e2e'}`,
                    color: active ? color : '#64748b',
                  }}
                >
                  <span>{s === 'Neutral' ? '⚖️' : s === 'Bull Case' ? '🐂' : '🐻'}</span>
                  <span className="font-medium">{s}</span>
                  {active && <span className="ml-auto text-xs" style={{ color }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* API Key */}
        <div>
          <button
            onClick={() => setShowApiInput(!showApiInput)}
            className="text-xs mb-2 flex items-center gap-1"
            style={{ color: '#475569' }}
          >
            🔑 {showApiInput ? 'Hide' : 'Set'} API Key
            <span style={{ color: apiKey ? '#22c55e' : '#ef4444' }}>
              {apiKey ? '●' : '○'}
            </span>
          </button>
          {showApiInput && (
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              className="w-full px-3 py-2 rounded-lg text-xs outline-none"
              style={{ background: '#12121a', border: '1px solid #1e1e2e', color: '#e2e8f0' }}
            />
          )}
          <p className="text-xs mt-1" style={{ color: '#334155' }}>
            Leave blank for demo report
          </p>
        </div>

        {error && (
          <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={generateReport}
          disabled={loading}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
          style={{
            background: loading ? '#1e1e2e' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: loading ? '#475569' : '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 0 20px rgba(59,130,246,0.25)',
          }}
        >
          {loading ? '⏳ Generating...' : '✨ Generate Research Report'}
        </button>

        {/* Disclaimer */}
        <p className="text-xs leading-relaxed" style={{ color: '#1e3a5f' }}>
          Reports are AI-generated and for informational purposes only. Not investment advice.
        </p>
      </div>

      {/* Right panel — report */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            {/* Spinner */}
            <div className="relative">
              <div
                className="w-16 h-16 rounded-full"
                style={{
                  border: '3px solid #1e1e2e',
                  borderTop: '3px solid #3b82f6',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium mb-1" style={{ color: '#60a5fa' }}>
                {loadingMsg}
              </div>
              <div className="text-xs" style={{ color: '#334155' }}>
                Powered by Claude AI • FinStation India
              </div>
            </div>
            <div className="flex gap-2">
              {['Fundamentals', 'Valuation', 'Sector', 'News'].map((tag, i) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    background: '#12121a',
                    border: '1px solid #1e1e2e',
                    color: '#475569',
                    animation: `pulse-slow ${1 + i * 0.3}s ease-in-out infinite`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {!loading && !report && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="text-6xl">🤖</div>
            <div className="text-xl font-semibold" style={{ color: '#94a3b8' }}>
              AI-Powered Equity Research
            </div>
            <div className="text-sm text-center" style={{ color: '#475569', maxWidth: 400 }}>
              Select a stock and configure your report preferences on the left, then click Generate to receive a professional equity research note.
            </div>
            <div
              className="mt-2 grid grid-cols-2 gap-3 text-xs"
              style={{ maxWidth: 400 }}
            >
              {[
                { icon: '📊', text: 'Financial Analysis' },
                { icon: '🎯', text: 'Price Targets' },
                { icon: '⚡', text: 'Key Catalysts' },
                { icon: '⚠️', text: 'Risk Assessment' },
              ].map((item) => (
                <div
                  key={item.text}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: '#12121a', border: '1px solid #1e1e2e', color: '#64748b' }}
                >
                  <span>{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && report && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Report toolbar */}
            <div
              className="flex items-center justify-between px-6 py-3 flex-shrink-0 no-print"
              style={{ borderBottom: '1px solid #1e1e2e', background: '#0d0d15' }}
            >
              <div className="flex items-center gap-3 text-xs">
                <span
                  className="px-2 py-1 rounded font-medium"
                  style={{ background: `${stanceColor}18`, color: stanceColor, border: `1px solid ${stanceColor}30` }}
                >
                  {stance}
                </span>
                <span style={{ color: '#475569' }}>{reportMeta?.type}</span>
                <span style={{ color: '#475569' }}>•</span>
                <span style={{ color: '#475569' }}>{reportMeta?.stock}</span>
                {reportMeta?.isDemo && (
                  <>
                    <span style={{ color: '#475569' }}>•</span>
                    <span style={{ color: '#f59e0b' }}>Demo Report (add API key for live)</span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: '#12121a', border: '1px solid #1e1e2e', color: '#94a3b8' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#60a5fa'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e1e2e'; e.currentTarget.style.color = '#94a3b8'; }}
                >
                  📋 Copy Report
                </button>
                <button
                  onClick={handlePrint}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: '#12121a', border: '1px solid #1e1e2e', color: '#94a3b8' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.color = '#4ade80'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e1e2e'; e.currentTarget.style.color = '#94a3b8'; }}
                >
                  🖨️ Download PDF
                </button>
              </div>
            </div>

            {/* Report content */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div style={{ maxWidth: 760 }}>
                {/* Header */}
                <div className="mb-6 pb-4" style={{ borderBottom: '2px solid #1e2a4a' }}>
                  <div className="flex items-center justify-between mb-1">
                    <div
                      className="text-xs font-bold tracking-widest uppercase"
                      style={{ color: '#3b82f6' }}
                    >
                      FinStation India — Equity Research
                    </div>
                    <div className="text-xs" style={{ color: '#475569' }}>{reportMeta?.date}</div>
                  </div>
                  <div className="text-xs" style={{ color: '#334155' }}>
                    For informational purposes only • Not investment advice
                  </div>
                </div>

                {/* Markdown report */}
                <MarkdownRenderer text={report} />

                {/* Footer */}
                <div className="mt-8 pt-4 text-xs" style={{ borderTop: '1px solid #1e1e2e', color: '#334155' }}>
                  Generated by FinStation AI | {reportMeta?.date} | Powered by Claude AI | For informational purposes only. This report does not constitute investment advice.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
