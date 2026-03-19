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

// Sector-specific demo report templates
const SECTOR_TEMPLATES = {
  Banking: {
    overview: (name) => `${name} is one of India's leading private sector banks, with a well-diversified loan book spanning retail, corporate, and SME segments. Its competitive moat stems from:\n\n- **Strong CASA franchise** driving low-cost deposit base and superior NIM profile\n- **Robust asset quality** with GNPA ratio consistently below sector average\n- **Digital banking leadership** with 70%+ transactions happening on digital channels`,
    financials: (name) => `Net Interest Income (NII) has grown at **15.2% CAGR** over 3 years driven by loan book expansion and stable margins:\n\n- NII (FY26E): ₹42,800 Cr (+14.5% YoY)\n- Net Interest Margin: 4.1% (sector best-in-class)\n- Net Profit: ₹16,200 Cr (+18.3% YoY)\n- Return on Equity: 17.4% (sector average: 14%)\n- GNPA: 2.1% | NNPA: 0.5% (well-controlled)`,
    valuation: () => `At current levels, the stock trades at **2.8x FY26E P/BV** vs. sector average of 2.2x, a premium justified by superior ROE and asset quality. DCF-implied fair value suggests **14% upside**.\n\n- P/BV (FY26E): 2.8x vs. peer median 2.2x\n- P/E (FY26E): 18.5x vs. sector 16x\n- DCF Fair Value: Band of ₹1,150–1,280 (WACC: 12%, terminal growth: 4%)`,
    catalysts: () => `- **Credit cost normalization**: Improving asset quality to drive lower provisions and PAT growth acceleration\n- **Retail loan growth**: Home loans and personal credit to drive 16–18% loan book CAGR in FY27\n- **Fee income diversification**: Cross-sell of insurance, mutual funds boosting non-interest income`,
    risks: () => `- **NIM compression**: Rising deposit costs may pressure margins by 10–15 bps in H1 FY27\n- **Unsecured lending stress**: Any deterioration in personal loan/credit card portfolio could spike credit costs\n- **Regulatory tightening**: RBI norms on LCR and risk weights may constrain loan growth`,
  },
  'Information Technology': {
    overview: (name) => `${name} is a global IT services and solutions provider, delivering digital transformation, cloud, and AI-led services to Fortune 500 clients across BFSI, retail, and manufacturing verticals. Key strengths:\n\n- **Large deal pipeline** with TCV of $4.2B in active pursuit stage\n- **AI & GenAI capability** with 12,000+ trained practitioners and proprietary platforms\n- **Margin resilience** driven by automation and offshore leverage`,
    financials: (name) => `Revenue in USD terms has grown at **8.3% CAGR** over 3 years with improving deal conversion:\n\n- Revenue (FY26E): $18.4B (+7.8% YoY in USD)\n- EBIT Margin: 21.5% (expansion of 50bps YoY)\n- Net Profit: ₹28,400 Cr (+12.1% YoY)\n- Return on Equity: 29.3% (sector leading)\n- Free Cash Flow conversion: 92% of net profit`,
    valuation: () => `The stock trades at **24.2x FY26E EPS**, a slight premium to Nifty IT index average of 22x, justified by consistent execution and margin stability.\n\n- P/E (FY26E): 24.2x vs. Nifty IT median 22x\n- EV/EBITDA: 17.8x (5-year mean: 18.2x — at slight discount)\n- DCF Fair Value: ₹1,520–1,680 (WACC: 11%, terminal growth: 3.5%)`,
    catalysts: () => `- **BFSI deal ramp-up**: $1.2B BFSI mega deal to contribute meaningfully from Q2 FY27\n- **Margin expansion**: Pyramid optimization and AI-led automation to add 80–100bps to margins\n- **USD tailwind**: INR depreciation adds ~2–3% to INR revenue without effort`,
    risks: () => `- **Client budget pressure**: Macro slowdown in US/Europe may delay discretionary IT spend\n- **Visa & immigration**: H-1B visa restrictions could increase onsite costs by 100–150bps\n- **Attrition uptick**: Return of hiring demand in US tech could pressure talent retention`,
  },
  FMCG: {
    overview: (name) => `${name} is a household consumer goods company with a dominant portfolio of iconic brands across food, personal care, and home care categories. Its moat is built on:\n\n- **Unmatched distribution reach** across 8M+ retail outlets including rural kirana stores\n- **Pricing power** with brand loyalty enabling regular price hikes ahead of inflation\n- **R&D-led premiumization** driving ASP expansion across categories`,
    financials: (name) => `Volume-led revenue growth has accelerated to **7.8% CAGR** as rural demand recovers:\n\n- Revenue (FY26E): ₹62,400 Cr (+9.2% YoY)\n- EBITDA Margin: 24.8% (180bps expansion on lower input costs)\n- Net Profit: ₹11,600 Cr (+14.7% YoY)\n- Return on Equity: 78% (asset-light model advantage)\n- Dividend Yield: 2.1% (consistent payout history)`,
    valuation: () => `At current levels, the stock trades at **52x FY26E EPS**, in line with its historical premium multiple for FMCG quality:\n\n- P/E (FY26E): 52x vs. FMCG sector median 45x\n- EV/EBITDA: 36x (10-year mean: 38x — slight discount)\n- DCF Fair Value: ₹2,450–2,650 (WACC: 10.5%, terminal growth: 5%)`,
    catalysts: () => `- **Rural demand revival**: Government capex and good monsoon to drive 2x urban volume growth in rural\n- **Premiumization tailwind**: Mid-to-premium mix shift to expand EBITDA margins by 100bps in FY27\n- **New category launches**: Entry into health & wellness segment addresses ₹15,000 Cr TAM`,
    risks: () => `- **Commodity inflation**: Crude, palm oil, packaging cost spikes could compress gross margins 100–150bps\n- **Competition from D2C**: Aggressive new-age brands gaining share in urban premium segments\n- **Rural slowdown risk**: Delayed monsoon or inflation could defer rural consumption recovery`,
  },
  Pharmaceuticals: {
    overview: (name) => `${name} is a leading Indian pharmaceutical company with a strong presence in branded generics (India), generic exports (US), and API manufacturing. Key differentiators:\n\n- **US generic pipeline** with 180+ ANDA filings and 12 Para IV opportunities\n- **Chronic therapy focus** in India business providing revenue visibility\n- **API integration** providing cost advantage vs. peers`,
    financials: (name) => `Revenue has grown at **13.6% CAGR** driven by US market share gains and India branded growth:\n\n- Revenue (FY26E): ₹18,200 Cr (+12.4% YoY)\n- EBITDA Margin: 24.2% (stable, with R&D at 7% of sales)\n- Net Profit: ₹3,100 Cr (+16.8% YoY)\n- Return on Equity: 18.6%\n- US Revenue Share: 42% of total (key growth engine)`,
    valuation: () => `The stock trades at **28x FY26E EPS**, in line with Indian pharma peers:\n\n- P/E (FY26E): 28x vs. pharma sector median 27x\n- EV/EBITDA: 18x (5-year mean: 17x — marginal premium)\n- DCF Fair Value: ₹1,580–1,720 (WACC: 11.5%, terminal growth: 4%)`,
    catalysts: () => `- **Complex generic approvals**: 3 complex injectables pending USFDA approval with combined TAM of $2.4B\n- **India branded business**: Chronic therapies (cardio, diabetes) growing 15%+ — premium to IPM growth\n- **Specialty pharma push**: Biosimilars pipeline to unlock $800M opportunity in US by FY28`,
    risks: () => `- **USFDA inspection risk**: Any form 483 observations could delay US product launches\n- **Price erosion in US**: Intensifying generic competition may compress US margins by 100bps\n- **API supply dependency**: Geopolitical risks to China API sourcing could increase input costs`,
  },
  Automobile: {
    overview: (name) => `${name} is a leading Indian automaker with a strong portfolio spanning passenger vehicles, commercial vehicles, and electric mobility. Its competitive edge:\n\n- **SUV-led product refresh** capturing India's fastest-growing vehicle segment\n- **EV transition readiness** with dedicated EV platform and ₹8,000 Cr investment committed\n- **Export market penetration** diversifying revenue beyond domestic cycle`,
    financials: (name) => `Revenue has compounded at **16.8% CAGR** as SUV volumes and realizations improve:\n\n- Revenue (FY26E): ₹1,42,000 Cr (+11.3% YoY)\n- EBITDA Margin: 14.8% (expansion of 60bps on product mix improvement)\n- Net Profit: ₹12,400 Cr (+19.2% YoY)\n- Return on Equity: 20.1%\n- Domestic Market Share: 18.4% (gaining 80bps YoY)`,
    valuation: () => `At current levels, stock trades at **22x FY26E EPS**, reasonable for a growth compounder in auto space:\n\n- P/E (FY26E): 22x vs. auto sector median 20x\n- EV/EBITDA: 13x (5-year mean: 12x)\n- DCF Fair Value: ₹2,800–3,100 (WACC: 11%, terminal growth: 4.5%)`,
    catalysts: () => `- **New SUV launches**: 3 new SUV models in FY27 to sustain volume momentum of 12–14% growth\n- **EV ramp-up**: EV volume to scale 3x by FY27, improving EV EBITDA from negative to breakeven\n- **International expansion**: Middle East and Africa markets targeted for 50,000+ unit exports by FY27`,
    risks: () => `- **Commodity cost pressure**: Steel, aluminum, semiconductor costs could compress margins 100–150bps\n- **EV adoption slowdown**: Slow charging infra build-out may delay EV volume targets\n- **Competitive intensity**: Hyundai, Kia, and new Chinese OEM entrants increasing competitive pressure`,
  },
};

const DEFAULT_TEMPLATE = {
  overview: (name) => `${name} is a well-established Indian company with a strong market position in its core business segments. Its competitive advantages include:\n\n- **Market leadership** in its primary business segments with consistent market share gains\n- **Strong balance sheet** with net cash position enabling reinvestment and shareholder returns\n- **Management quality** with proven track record of capital allocation and execution`,
  financials: (name) => `Revenue has compounded at **12% CAGR** over 3 years with improving profitability:\n\n- Revenue (FY26E): Growing double-digits YoY\n- EBITDA Margin: Expanding 50–100bps annually on operating leverage\n- Net Profit Growth: 15–18% YoY driven by operating and financial leverage\n- Return on Equity: Above sector average\n- Free Cash Flow: Strong generation supporting dividends and buybacks`,
  valuation: () => `The stock trades at a valuation reflecting its quality premium vs. sector peers:\n\n- P/E (FY26E): In line with or at modest premium to sector median\n- EV/EBITDA: Near historical mean levels\n- DCF Fair Value: 10–15% upside from current levels (WACC: 11.5%, terminal growth: 4%)`,
  catalysts: () => `- **Volume/revenue growth acceleration**: Improving demand environment and market share gains\n- **Margin expansion**: Cost optimization and operating leverage driving profitability improvement\n- **New business/product initiatives**: Adjacent opportunity expansion into new markets or geographies`,
  risks: () => `- **Macro slowdown**: Any deterioration in domestic consumption or global demand\n- **Input cost inflation**: Commodity or energy cost spikes compressing margins\n- **Regulatory changes**: Policy shifts affecting pricing, taxation, or competitive dynamics`,
};

function getDemoReport(stockName, reportType, stance, sector) {
  const rating = stance === 'Bull Case' ? 'BUY' : stance === 'Bear Case' ? 'SELL' : 'HOLD';
  const tpl = SECTOR_TEMPLATES[sector] || DEFAULT_TEMPLATE;

  const conclusion = stance === 'Bull Case'
    ? `${stockName} offers an attractive risk-reward at current valuations with multiple earnings catalysts on the horizon. We initiate with a **BUY** rating. Investors should accumulate on dips for a 12-month investment horizon.`
    : stance === 'Bear Case'
    ? `While ${stockName} is a quality business, elevated valuations and near-term execution headwinds limit upside. We maintain a **SELL** rating — a correction toward fair value provides a better entry opportunity.`
    : `${stockName} remains a quality compounder but near-term upside appears fairly priced in. We maintain a **HOLD** — existing investors should stay invested while fresh money may await a better entry point.`;

  return `# Equity Research Report: ${stockName}

## Investment Summary

**Rating: ${rating}** | Analyst Stance: ${stance} | Sector: ${sector || 'Equity'}

${stockName} presents a ${stance === 'Bull Case' ? 'compelling investment opportunity' : stance === 'Bear Case' ? 'cautious outlook' : 'balanced investment case'} over a 12-month horizon. Our analysis of fundamentals, valuations, and sectoral dynamics underpins our **${rating}** recommendation.

## Company Overview

${tpl.overview(stockName)}

## Financial Performance

${tpl.financials(stockName)}

## Valuation

${tpl.valuation()}

## Key Catalysts

${tpl.catalysts()}

## Key Risks

${tpl.risks()}

## Conclusion

${conclusion}

---
*This is a demo report. Add your Anthropic API key for a live AI-generated report tailored to ${stockName}. Not investment advice.*`;
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
    const stockSector = stock?.sector || 'Equity';
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
      const demo = getDemoReport(stockName, reportType, stance, stockSector);
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
