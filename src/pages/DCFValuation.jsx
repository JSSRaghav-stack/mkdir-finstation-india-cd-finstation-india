import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { STOCK_LIST, DETAILED_STOCK_DATA } from '../data/mockData.js';
import { calculateDCF, calculateSensitivity } from '../utils/calculations.js';
import { formatCroreCompact } from '../utils/formatters.js';

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

function NumberInput({ label, value, onChange, prefix, suffix, tooltip }) {
  return (
    <div className="mb-3">
      <label className="block text-xs mb-1" style={{ color: '#64748b' }}>
        {tooltip ? <Tooltip2 label={tooltip}>{label}</Tooltip2> : label}
      </label>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{ background: '#0d0d15', border: '1px solid #2d2d45' }}
      >
        {prefix && <span className="text-xs" style={{ color: '#475569' }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 bg-transparent outline-none text-sm font-medium"
          style={{ color: '#e2e8f0' }}
        />
        {suffix && <span className="text-xs" style={{ color: '#475569' }}>{suffix}</span>}
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

export default function DCFValuation() {
  const [selectedStock, setSelectedStock] = useState('');
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [currentPrice, setCurrentPrice] = useState(2847);

  const handleStockChange = (ticker) => {
    setSelectedStock(ticker);
    const data = DETAILED_STOCK_DATA[ticker];
    if (data) {
      setCurrentPrice(data.price);
      setInputs((prev) => ({
        ...prev,
        baseRevenue: Math.round(data.revenue / 100),
        sharesOutstanding: Math.round(data.marketCapCr / data.price),
        netDebt: Math.round((data.debtEquity || 0) * (data.marketCapCr * 0.5 / data.price)),
      }));
    }
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
            Reference Stock (optional)
          </label>
          <select
            value={selectedStock}
            onChange={(e) => handleStockChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs outline-none"
            style={{ background: '#12121a', border: '1px solid #1e1e2e', color: '#e2e8f0' }}
          >
            <option value="">— Custom / Unlisted —</option>
            {Object.keys(DETAILED_STOCK_DATA).map((t) => {
              const s = STOCK_LIST.find((x) => x.ticker === t);
              return s ? (
                <option key={t} value={t}>{s.name}</option>
              ) : null;
            })}
          </select>
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
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div
            className="rounded-xl p-4"
            style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
          >
            <div className="text-xs mb-1" style={{ color: '#64748b' }}>Enterprise Value</div>
            <div className="text-xl font-bold" style={{ color: '#f1f5f9' }}>
              {formatCroreCompact(result.enterpriseValue)}
            </div>
          </div>
          <div
            className="rounded-xl p-4"
            style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
          >
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
        <div
          className="rounded-xl overflow-hidden mb-5"
          style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
        >
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
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
          >
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e1e2e' }}>
              <span className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Valuation Bridge</span>
            </div>
            <table className="w-full">
              <tbody>
                <ResultRow
                  label="Sum of PV(FCFs)"
                  value={`₹${result.sumPvFcf.toLocaleString('en-IN')} Cr`}
                  tooltip="Sum of present values of 5-year FCFs"
                />
                <ResultRow
                  label="Terminal Value"
                  value={`₹${result.terminalValue.toLocaleString('en-IN')} Cr`}
                  tooltip="Gordon Growth Model terminal value at year 5"
                />
                <ResultRow
                  label="PV of Terminal Value"
                  value={`₹${result.pvTerminalValue.toLocaleString('en-IN')} Cr`}
                  tooltip="Terminal value discounted back to present"
                />
                <ResultRow
                  label="Enterprise Value"
                  value={`₹${result.enterpriseValue.toLocaleString('en-IN')} Cr`}
                  highlight
                  tooltip="PV(FCFs) + PV(Terminal Value)"
                />
                <ResultRow
                  label="Less: Net Debt"
                  value={`₹${inputs.netDebt.toLocaleString('en-IN')} Cr`}
                  indent
                  tooltip="Net Debt = Total Debt - Cash"
                />
                <ResultRow
                  label="Equity Value"
                  value={`₹${result.equityValue.toLocaleString('en-IN')} Cr`}
                  highlight
                  tooltip="Enterprise Value minus Net Debt"
                />
                <ResultRow
                  label="Intrinsic Value / Share"
                  value={`₹${result.intrinsicValuePerShare.toLocaleString('en-IN')}`}
                  highlight
                  tooltip="Equity Value divided by shares outstanding"
                />
              </tbody>
            </table>
          </div>

          {/* Sensitivity */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
          >
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
        <div
          className="rounded-xl p-5"
          style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
        >
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
