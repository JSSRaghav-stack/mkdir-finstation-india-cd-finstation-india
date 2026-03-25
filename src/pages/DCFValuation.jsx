import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { STOCK_LIST, DETAILED_STOCK_DATA } from '../data/mockData.js';
import { calculateDCF, calculateSensitivity } from '../utils/calculations.js';
import { formatCroreCompact } from '../utils/formatters.js';
import { fetchStockDetail } from '../utils/api.js';

function Tooltip2({ label, children }) {
  return (
    <span className="tooltip-container cursor-help">
      <span style={{ borderBottom: '1px dashed #475569' }}>{children}</span>
      <span className="tooltip-text">{label}</span>
    </span>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix, tooltip }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs" style={{ color: '#64748b' }}>
          {tooltip ? <Tooltip2 label={tooltip}>{label}</Tooltip2> : label}
        </span>
        <span className="text-xs font-semibold" style={{ color: '#60a5fa' }}>
          {value}{suffix}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #3b82f6 ${pct}%, #1e1e2e ${pct}%)`,
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange, tooltip }) {
  return (
    <div className="mb-3">
      <label className="block text-xs mb-1" style={{ color: '#64748b' }}>
        {tooltip ? <Tooltip2 label={tooltip}>{label}</Tooltip2> : label}
      </label>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{ background: '#0d0d15', border: '1px solid #2d2d45' }}
      >
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 bg-transparent outline-none text-sm font-medium"
          style={{ color: '#e2e8f0' }}
        />
      </div>
    </div>
  );
}

function ResultRow({ label, value, highlight, indent, tooltip }) {
  return (
    <tr
      style={{
        background: highlight ? 'rgba(59,130,246,0.08)' : 'transparent',
        borderBottom: '1px solid #1a1a2a',
      }}
    >
      <td className="px-3 py-2 text-xs" style={{ color: highlight ? '#93c5fd' : '#94a3b8', paddingLeft: indent ? 24 : 12 }}>
        {tooltip ? <Tooltip2 label={tooltip}>{label}</Tooltip2> : label}
      </td>
      <td className="px-3 py-2 text-xs font-semibold text-right" style={{ color: highlight ? '#60a5fa' : '#e2e8f0' }}>
        {value}
      </td>
    </tr>
  );
}

const DEFAULT_INPUTS = {
  baseRevenue: 50000,
  growthRate1to3: 15,
  growthRate4to5: 10,
  ebitdaMargin: 22,
  depreciation: 4,
  taxRate: 25,
  capex: 6,
  changeWC: 3,
  wacc: 12,
  terminalGrowthRate: 4,
  netDebt: 5000,
  sharesOutstanding: 680,
};

// Industry-specific DCF parameter defaults
const SECTOR_DCF_DEFAULTS = {
  'Banking': { growthRate1to3: 14, growthRate4to5: 10, ebitdaMargin: 30, depreciation: 1, taxRate: 25, capex: 2, changeWC: 0, wacc: 13, terminalGrowthRate: 4.5 },
  'NBFC': { growthRate1to3: 18, growthRate4to5: 12, ebitdaMargin: 35, depreciation: 1, taxRate: 25, capex: 2, changeWC: 0, wacc: 13.5, terminalGrowthRate: 4.5 },
  'Information Technology': { growthRate1to3: 12, growthRate4to5: 8, ebitdaMargin: 22, depreciation: 3, taxRate: 25, capex: 4, changeWC: 2, wacc: 11, terminalGrowthRate: 3.5 },
  'FMCG': { growthRate1to3: 8, growthRate4to5: 6, ebitdaMargin: 24, depreciation: 3, taxRate: 25, capex: 3, changeWC: 2, wacc: 10.5, terminalGrowthRate: 5 },
  'Pharmaceuticals': { growthRate1to3: 12, growthRate4to5: 9, ebitdaMargin: 24, depreciation: 4, taxRate: 25, capex: 7, changeWC: 3, wacc: 11.5, terminalGrowthRate: 4 },
  'Automobile': { growthRate1to3: 10, growthRate4to5: 7, ebitdaMargin: 14, depreciation: 5, taxRate: 25, capex: 7, changeWC: 3, wacc: 11, terminalGrowthRate: 4.5 },
  'Telecom': { growthRate1to3: 10, growthRate4to5: 7, ebitdaMargin: 50, depreciation: 20, taxRate: 25, capex: 24, changeWC: 2, wacc: 12, terminalGrowthRate: 4 },
  'Utilities': { growthRate1to3: 8, growthRate4to5: 6, ebitdaMargin: 30, depreciation: 8, taxRate: 25, capex: 15, changeWC: 2, wacc: 10, terminalGrowthRate: 4 },
  'Infrastructure': { growthRate1to3: 12, growthRate4to5: 9, ebitdaMargin: 16, depreciation: 4, taxRate: 25, capex: 8, changeWC: 3, wacc: 11, terminalGrowthRate: 4.5 },
  'Metals & Mining': { growthRate1to3: 8, growthRate4to5: 5, ebitdaMargin: 16, depreciation: 5, taxRate: 25, capex: 8, changeWC: 4, wacc: 12, terminalGrowthRate: 3 },
  'Energy & Retail': { growthRate1to3: 10, growthRate4to5: 7, ebitdaMargin: 17, depreciation: 4, taxRate: 25, capex: 8, changeWC: 3, wacc: 11, terminalGrowthRate: 4 },
  'Oil & Gas': { growthRate1to3: 6, growthRate4to5: 4, ebitdaMargin: 32, depreciation: 6, taxRate: 30, capex: 12, changeWC: 3, wacc: 11, terminalGrowthRate: 3 },
  'Consumer Discretionary': { growthRate1to3: 15, growthRate4to5: 10, ebitdaMargin: 13, depreciation: 3, taxRate: 25, capex: 4, changeWC: 3, wacc: 11, terminalGrowthRate: 4.5 },
  'Cement': { growthRate1to3: 12, growthRate4to5: 8, ebitdaMargin: 20, depreciation: 6, taxRate: 25, capex: 10, changeWC: 2, wacc: 11, terminalGrowthRate: 4 },
};

export default function DCFValuation() {
  const [selectedStock, setSelectedStock] = useState('');
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [currentPrice, setCurrentPrice] = useState(2847);
  const [fetchingStock, setFetchingStock] = useState(false);
  const [dataSource, setDataSource] = useState('');

  const handleStockChange = async (ticker) => {
    setSelectedStock(ticker);
    if (!ticker) {
      setInputs(DEFAULT_INPUTS);
      setCurrentPrice(2847);
      setDataSource('');
      return;
    }

    setFetchingStock(true);
    setDataSource('');

    // Helper to compute inputs from financial data
    const buildInputs = (data, sector) => {
      const sectorDefaults = SECTOR_DCF_DEFAULTS[sector] || {};
      const revenue = data.revenue > 0 ? Math.max(1, Math.round(data.revenue / 100)) : DEFAULT_INPUTS.baseRevenue;
      const shares = data.marketCapCr > 0 && data.price > 0
        ? Math.max(1, Math.round(data.marketCapCr / data.price))
        : DEFAULT_INPUTS.sharesOutstanding;
      const debtEquityNum = typeof data.debtEquity === 'number' ? data.debtEquity : 0;
      const netDebt = Math.max(0, Math.round(debtEquityNum * (data.marketCapCr * 0.3 / (data.price || 1))));
      return {
        baseRevenue: revenue,
        sharesOutstanding: shares,
        netDebt: netDebt > 0 ? netDebt : DEFAULT_INPUTS.netDebt,
        ebitdaMargin: typeof data.ebitdaMargin === 'number' ? data.ebitdaMargin : (sectorDefaults.ebitdaMargin || DEFAULT_INPUTS.ebitdaMargin),
        growthRate1to3: sectorDefaults.growthRate1to3 || DEFAULT_INPUTS.growthRate1to3,
        growthRate4to5: sectorDefaults.growthRate4to5 || DEFAULT_INPUTS.growthRate4to5,
        depreciation: sectorDefaults.depreciation || DEFAULT_INPUTS.depreciation,
        taxRate: sectorDefaults.taxRate || DEFAULT_INPUTS.taxRate,
        capex: sectorDefaults.capex || DEFAULT_INPUTS.capex,
        changeWC: sectorDefaults.changeWC ?? DEFAULT_INPUTS.changeWC,
        wacc: sectorDefaults.wacc || DEFAULT_INPUTS.wacc,
        terminalGrowthRate: sectorDefaults.terminalGrowthRate || DEFAULT_INPUTS.terminalGrowthRate,
      };
    };

    // Try mock data first
    const mockD = DETAILED_STOCK_DATA[ticker];
    const stockInfo = STOCK_LIST.find((s) => s.ticker === ticker);
    const sector = mockD?.sector || stockInfo?.sector || 'Equity';

    if (mockD) {
      setCurrentPrice(mockD.price);
      setInputs(buildInputs(mockD, sector));
      setDataSource('mock');
      setFetchingStock(false);
      return;
    }

    // Try live data
    try {
      const live = await fetchStockDetail(ticker);
      if (live && live.price > 0) {
        setCurrentPrice(live.price);
        setInputs(buildInputs(live, live.sector || sector));
        setDataSource('live');
      }
    } catch {
      // leave defaults
    }
    setFetchingStock(false);
  };

  const set = (key) => (val) => setInputs((prev) => ({ ...prev, [key]: val }));

  const result = useMemo(() => calculateDCF(inputs), [inputs]);
  const sensitivity = useMemo(
    () => calculateSensitivity(inputs, currentPrice),
    [inputs, currentPrice]
  );

  const chartData = result.rows.map((r) => ({
    year: `FY${26 + r.year - 1}`,
    fcf: r.fcf,
    pvFcf: r.pvFcf,
  }));

  const upside = result.intrinsicValuePerShare > 0 && currentPrice > 0
    ? ((result.intrinsicValuePerShare - currentPrice) / currentPrice) * 100
    : null;

  return (
    <div className="h-full flex overflow-hidden" style={{ background: '#0a0a0f' }}>
      {/* Left panel - inputs */}
      <div
        className="flex-shrink-0 overflow-y-auto px-5 py-5"
        style={{ width: 280, background: '#0d0d15', borderRight: '1px solid #1e1e2e' }}
      >
        <h2 className="text-sm font-bold mb-4" style={{ color: '#f1f5f9' }}>DCF Inputs</h2>

        {/* Stock selector */}
        <div className="mb-4">
          <label className="block text-xs font-medium mb-1" style={{ color: '#64748b' }}>
            Reference Stock (auto-fill)
          </label>
          <select
            value={selectedStock}
            onChange={(e) => handleStockChange(e.target.value)}
            disabled={fetchingStock}
            className="w-full px-3 py-2 rounded-lg text-xs outline-none"
            style={{ background: '#12121a', border: '1px solid #1e1e2e', color: '#e2e8f0', opacity: fetchingStock ? 0.6 : 1 }}
          >
            <option value="">— Custom / Unlisted —</option>
            {STOCK_LIST.map((s) => (
              <option key={s.ticker} value={s.ticker}>{s.name}</option>
            ))}
          </select>
          {dataSource && (
            <div className="mt-1 text-xs" style={{ color: dataSource === 'live' ? '#4ade80' : '#60a5fa' }}>
              {dataSource === 'live' ? '● Live data loaded' : '● Mock data loaded'}
            </div>
          )}
          {fetchingStock && (
            <div className="mt-1 text-xs" style={{ color: '#64748b' }}>Fetching data...</div>
          )}
        </div>

        {selectedStock && (
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1" style={{ color: '#64748b' }}>
              Current Market Price (₹)
            </label>
            <input
              type="number"
              value={currentPrice}
              onChange={(e) => setCurrentPrice(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none"
              style={{ background: '#12121a', border: '1px solid #1e1e2e', color: '#e2e8f0' }}
            />
          </div>
        )}

        <div className="text-xs font-semibold mb-3 mt-2" style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Revenue Model
        </div>

        <NumberInput
          label="Base Revenue (₹ Cr)"
          value={inputs.baseRevenue}
          onChange={set('baseRevenue')}
          tooltip="Starting revenue for Year 0 (current year base)"
        />

        <Slider
          label="Revenue Growth Yr 1–3 (%)"
          value={inputs.growthRate1to3}
          min={0} max={40} step={0.5}
          onChange={set('growthRate1to3')}
          suffix="%"
          tooltip="Compound annual growth rate for years 1 to 3"
        />

        <Slider
          label="Revenue Growth Yr 4–5 (%)"
          value={inputs.growthRate4to5}
          min={0} max={25} step={0.5}
          onChange={set('growthRate4to5')}
          suffix="%"
          tooltip="Slower growth rate as business matures in years 4-5"
        />

        <div className="text-xs font-semibold mb-3 mt-2" style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Profitability
        </div>

        <Slider
          label="EBITDA Margin (%)"
          value={inputs.ebitdaMargin}
          min={10} max={50} step={0.5}
          onChange={set('ebitdaMargin')}
          suffix="%"
          tooltip="EBITDA as percentage of revenue"
        />

        <Slider
          label="Depreciation % of Rev"
          value={inputs.depreciation}
          min={1} max={10} step={0.5}
          onChange={set('depreciation')}
          suffix="%"
          tooltip="D&A as percentage of revenue"
        />

        <Slider
          label="Tax Rate (%)"
          value={inputs.taxRate}
          min={15} max={35} step={1}
          onChange={set('taxRate')}
          suffix="%"
          tooltip="Effective corporate tax rate (India: 22-30%)"
        />

        <div className="text-xs font-semibold mb-3 mt-2" style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Cash Flow Drivers
        </div>

        <Slider
          label="CapEx % of Revenue"
          value={inputs.capex}
          min={1} max={15} step={0.5}
          onChange={set('capex')}
          suffix="%"
          tooltip="Capital expenditure as percentage of revenue"
        />

        <Slider
          label="Change in WC % of Rev"
          value={inputs.changeWC}
          min={-5} max={10} step={0.5}
          onChange={set('changeWC')}
          suffix="%"
          tooltip="Working capital change as % of revenue (positive = cash outflow)"
        />

        <div className="text-xs font-semibold mb-3 mt-2" style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Discount Rate
        </div>

        <Slider
          label="WACC (%)"
          value={inputs.wacc}
          min={8} max={20} step={0.5}
          onChange={set('wacc')}
          suffix="%"
          tooltip="Weighted Average Cost of Capital — the discount rate for FCFs"
        />

        <Slider
          label="Terminal Growth Rate (%)"
          value={inputs.terminalGrowthRate}
          min={2} max={6} step={0.5}
          onChange={set('terminalGrowthRate')}
          suffix="%"
          tooltip="Long-term perpetuity growth rate (typically 3-5% for India)"
        />

        <div className="text-xs font-semibold mb-3 mt-2" style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Balance Sheet
        </div>

        <NumberInput
          label="Net Debt (₹ Cr)"
          value={inputs.netDebt}
          onChange={set('netDebt')}
          tooltip="Total debt minus cash & equivalents"
        />

        <NumberInput
          label="Shares Outstanding (Cr)"
          value={inputs.sharesOutstanding}
          onChange={set('sharesOutstanding')}
          tooltip="Total shares outstanding in crores"
        />
      </div>

      {/* Right panel - outputs */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {fetchingStock && (
          <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <div className="text-sm font-semibold mb-3" style={{ color: '#60a5fa' }}>⏳ Building DCF Model...</div>
            <div className="space-y-1.5">
              {[
                { step: 1, label: 'Fetching stock price & financials', done: true },
                { step: 2, label: 'Building revenue model', done: false },
                { step: 3, label: 'Calculating valuations', done: false },
              ].map(s => (
                <div key={s.step} className="flex items-center gap-2 text-xs" style={{ color: s.done ? '#22c55e' : '#64748b' }}>
                  <span>{s.done ? '✅' : '⏳'}</span>
                  <span>Step {s.step}: {s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
            <div className="text-xs mb-1" style={{ color: '#64748b' }}>Enterprise Value</div>
            <div className="text-xl font-bold" style={{ color: '#f1f5f9' }}>
              {formatCroreCompact(result.enterpriseValue)}
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
            <div className="text-xs mb-1" style={{ color: '#64748b' }}>Equity Value</div>
            <div className="text-xl font-bold" style={{ color: '#f1f5f9' }}>
              {formatCroreCompact(result.equityValue)}
            </div>
          </div>
          <div
            className="rounded-xl p-4"
            style={{
              background: upside === null ? '#12121a' : upside >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: upside === null ? '1px solid #1e1e2e' : upside >= 0 ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <div className="text-xs mb-1" style={{ color: '#64748b' }}>
              <Tooltip2 label="Intrinsic fair value per share based on DCF model">
                Intrinsic Value / Share
              </Tooltip2>
            </div>
            <div
              className="text-xl font-bold"
              style={{ color: upside === null ? '#f1f5f9' : upside >= 0 ? '#22c55e' : '#ef4444' }}
            >
              ₹{result.intrinsicValuePerShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            {upside !== null && (
              <div className="text-xs mt-0.5" style={{ color: upside >= 0 ? '#4ade80' : '#f87171' }}>
                {upside >= 0 ? '+' : ''}{upside.toFixed(1)}% vs CMP ₹{currentPrice}
              </div>
            )}
          </div>
        </div>

        {/* DCF Table */}
        <div className="rounded-xl overflow-hidden mb-5" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e1e2e' }}>
            <span className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>
              📊 DCF Model (₹ Crore)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: '#0d0d15', borderBottom: '1px solid #1e1e2e' }}>
                  <th className="px-3 py-2 text-left font-medium" style={{ color: '#64748b' }}>Metric</th>
                  {result.rows.map((r) => (
                    <th key={r.year} className="px-3 py-2 text-right font-medium" style={{ color: '#64748b' }}>
                      FY{25 + r.year}E
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'revenue', label: 'Revenue', tooltip: 'Total revenue' },
                  { key: 'ebitda', label: 'EBITDA', tooltip: 'Earnings before interest, tax, D&A' },
                  { key: 'ebit', label: 'EBIT', tooltip: 'Earnings before interest and tax' },
                  { key: 'nopat', label: 'NOPAT', tooltip: 'Net Operating Profit After Tax' },
                  { key: 'da', label: '(+) D&A', tooltip: 'Depreciation and Amortization added back' },
                  { key: 'capex', label: '(-) CapEx', tooltip: 'Capital Expenditure subtracted' },
                  { key: 'changeWC', label: '(-) Δ Working Capital', tooltip: 'Change in net working capital' },
                  { key: 'fcf', label: 'Free Cash Flow', tooltip: 'NOPAT + D&A - CapEx - ΔWC', highlight: true },
                  { key: 'pvFcf', label: 'PV of FCF', tooltip: 'Present value discounted at WACC', highlight: true },
                ].map((row) => (
                  <tr
                    key={row.key}
                    style={{
                      background: row.highlight ? 'rgba(59,130,246,0.06)' : 'transparent',
                      borderBottom: '1px solid #1a1a2a',
                    }}
                  >
                    <td className="px-3 py-2 text-xs" style={{ color: row.highlight ? '#93c5fd' : '#94a3b8' }}>
                      {row.tooltip ? <Tooltip2 label={row.tooltip}>{row.label}</Tooltip2> : row.label}
                    </td>
                    {result.rows.map((r) => (
                      <td
                        key={r.year}
                        className="px-3 py-2 text-right font-medium"
                        style={{ color: row.highlight ? '#60a5fa' : '#e2e8f0' }}
                      >
                        {r[row.key].toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary + Sensitivity */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          {/* Valuation bridge */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e1e2e' }}>
              <span className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Valuation Bridge</span>
            </div>
            <table className="w-full">
              <tbody>
                <ResultRow label="Sum of PV(FCFs)" value={`₹${result.sumPvFcf.toLocaleString('en-IN')} Cr`} tooltip="Sum of present values of 5-year FCFs" />
                <ResultRow label="Terminal Value" value={`₹${result.terminalValue.toLocaleString('en-IN')} Cr`} tooltip="Gordon Growth Model terminal value at year 5" />
                <ResultRow label="PV of Terminal Value" value={`₹${result.pvTerminalValue.toLocaleString('en-IN')} Cr`} tooltip="Terminal value discounted back to present" />
                <ResultRow label="Enterprise Value" value={`₹${result.enterpriseValue.toLocaleString('en-IN')} Cr`} highlight tooltip="PV(FCFs) + PV(Terminal Value)" />
                <ResultRow label="Less: Net Debt" value={`₹${inputs.netDebt.toLocaleString('en-IN')} Cr`} indent tooltip="Net Debt = Total Debt - Cash" />
                <ResultRow label="Equity Value" value={`₹${result.equityValue.toLocaleString('en-IN')} Cr`} highlight tooltip="Enterprise Value minus Net Debt" />
                <ResultRow label="Intrinsic Value / Share" value={`₹${result.intrinsicValuePerShare.toLocaleString('en-IN')}`} highlight tooltip="Equity Value divided by shares outstanding" />
              </tbody>
            </table>
          </div>

          {/* Sensitivity */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e1e2e' }}>
              <span className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>
                <Tooltip2 label="Intrinsic value per share at different WACC and Terminal Growth Rate combinations">
                  Sensitivity Analysis
                </Tooltip2>
              </span>
            </div>
            <div className="p-4">
              <div className="text-xs mb-3" style={{ color: '#64748b' }}>
                Intrinsic Value (₹) — WACC (rows) × Terminal Growth (cols)
              </div>
              <table className="w-full text-center text-xs">
                <thead>
                  <tr>
                    <th className="py-1.5 px-2 text-left" style={{ color: '#475569' }}>WACC \ TGR</th>
                    {[-0.5, 0, 0.5].map((d) => (
                      <th key={d} className="py-1.5 px-2" style={{ color: '#475569' }}>
                        {(inputs.terminalGrowthRate + d).toFixed(1)}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sensitivity.map((row, ri) => (
                    <tr key={ri}>
                      <td className="py-1.5 px-2 text-left font-medium" style={{ color: '#64748b' }}>
                        {(inputs.wacc + [-1, 0, 1][ri]).toFixed(1)}%
                      </td>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="py-1.5 px-2 rounded font-semibold"
                          style={{
                            color: cell.isAbove ? '#22c55e' : '#ef4444',
                            background: cell.isAbove ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                          }}
                        >
                          ₹{cell.value.toLocaleString('en-IN')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex gap-4 text-xs" style={{ color: '#475569' }}>
                <span style={{ color: '#22c55e' }}>● Above CMP</span>
                <span style={{ color: '#ef4444' }}>● Below CMP</span>
              </div>
            </div>
          </div>
        </div>

        {/* FCF Bar Chart */}
        <div className="rounded-xl p-5" style={{ background: '#12121a', border: '1px solid #1e1e2e' }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: '#f1f5f9' }}>
            Free Cash Flow by Year (₹ Cr)
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="year" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
                tick={{ fill: '#475569', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [`₹${v.toLocaleString('en-IN')} Cr`, 'FCF']}
                contentStyle={{ background: '#1e1e2e', border: '1px solid #2d2d45', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#60a5fa' }}
              />
              <Bar dataKey="fcf" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.fcf >= 0 ? '#3b82f6' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
