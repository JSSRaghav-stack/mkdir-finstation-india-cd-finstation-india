import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { calculateLBO } from '../utils/calculations.js';
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
        <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #8b5cf6 ${pct}%, #1e1e2e ${pct}%)`,
          outline: 'none',
        }}
      />
    </div>
  );
}

function NumberInput({ label, value, onChange, prefix, tooltip, small }) {
  return (
    <div className={small ? 'mb-2' : 'mb-3'}>
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
      </div>
    </div>
  );
}

const DEFAULT_INPUTS = {
  targetName: 'Target Company',
  entryRevenue: 5000,
  entryEbitdaMargin: 22,
  entryMultiple: 10,
  debtEbitda: 3,
  interestRate: 10,
  holdingPeriod: 5,
  revenueCagr: 12,
  exitEbitdaMargin: 24,
  exitMultiple: 11,
  mgmtFee: 2,
};

function ReturnsBadge({ irr }) {
  if (irr >= 25) return (
    <div className="flex flex-col items-center justify-center rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>
      <div className="text-xs font-medium mb-1" style={{ color: '#4ade80' }}>Strong Return</div>
      <div className="text-3xl font-extrabold" style={{ color: '#22c55e' }}>{irr.toFixed(1)}%</div>
      <div className="text-xs mt-1" style={{ color: '#4ade80' }}>IRR ≥ 25% threshold met</div>
    </div>
  );
  if (irr >= 15) return (
    <div className="flex flex-col items-center justify-center rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
      <div className="text-xs font-medium mb-1" style={{ color: '#fbbf24' }}>Moderate Return</div>
      <div className="text-3xl font-extrabold" style={{ color: '#f59e0b' }}>{irr.toFixed(1)}%</div>
      <div className="text-xs mt-1" style={{ color: '#fbbf24' }}>15% ≤ IRR &lt; 25%</div>
    </div>
  );
  return (
    <div className="flex flex-col items-center justify-center rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
      <div className="text-xs font-medium mb-1" style={{ color: '#f87171' }}>Weak Return</div>
      <div className="text-3xl font-extrabold" style={{ color: '#ef4444' }}>{irr.toFixed(1)}%</div>
      <div className="text-xs mt-1" style={{ color: '#f87171' }}>IRR &lt; 15%</div>
    </div>
  );
}

export default function LBOAnalyzer() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const set = (key) => (val) => setInputs((prev) => ({ ...prev, [key]: val }));

  const result = useMemo(() => {
    try {
      return calculateLBO(inputs);
    } catch {
      return null;
    }
  }, [inputs]);

  const waterfallData = result ? [
    { name: 'Entry Equity', value: result.entryEquity, fill: '#3b82f6' },
    { name: 'Value Creation', value: result.exitEquity - result.entryEquity, fill: result.exitEquity >= result.entryEquity ? '#22c55e' : '#ef4444' },
    { name: 'Exit Equity', value: result.exitEquity, fill: '#8b5cf6' },
  ] : [];

  return (
    <div className="h-full flex overflow-hidden" style={{ background: '#0a0a0f' }}>
      {/* Left panel */}
      <div
        className="flex-shrink-0 overflow-y-auto px-5 py-5"
        style={{ width: 280, background: '#0d0d15', borderRight: '1px solid #1e1e2e' }}
      >
        <h2 className="text-sm font-bold mb-4" style={{ color: '#f1f5f9' }}>LBO Parameters</h2>

        {/* Target name */}
        <div className="mb-4">
          <label className="block text-xs mb-1" style={{ color: '#64748b' }}>Target Company Name</label>
          <input
            type="text"
            value={inputs.targetName}
            onChange={(e) => set('targetName')(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: '#12121a', border: '1px solid #1e1e2e', color: '#e2e8f0' }}
          />
        </div>

        <div className="text-xs font-semibold mb-3" style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Entry
        </div>

        <NumberInput
          label="Entry Revenue (₹ Cr)"
          value={inputs.entryRevenue}
          onChange={set('entryRevenue')}
          tooltip="Target company's LTM revenue at acquisition date"
        />

        <Slider
          label="Entry EBITDA Margin (%)"
          value={inputs.entryEbitdaMargin}
          min={5} max={50} step={0.5}
          onChange={set('entryEbitdaMargin')}
          suffix="%"
          tooltip="EBITDA as % of revenue at entry"
        />

        <Slider
          label="Entry EV/EBITDA Multiple"
          value={inputs.entryMultiple}
          min={6} max={20} step={0.5}
          onChange={set('entryMultiple')}
          suffix="x"
          tooltip="Acquisition multiple — how much the PE firm pays for each ₹1 of EBITDA"
        />

        <div className="text-xs font-semibold mb-3 mt-2" style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Financing
        </div>

        <Slider
          label="Debt / EBITDA at Entry"
          value={inputs.debtEbitda}
          min={1} max={6} step={0.25}
          onChange={set('debtEbitda')}
          suffix="x"
          tooltip="Leverage ratio — debt as multiple of EBITDA at acquisition"
        />

        <Slider
          label="Interest Rate on Debt (%)"
          value={inputs.interestRate}
          min={8} max={16} step={0.25}
          onChange={set('interestRate')}
          suffix="%"
          tooltip="Annual interest rate on acquisition debt"
        />

        <div className="text-xs font-semibold mb-3 mt-2" style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Holding Period
        </div>

        <div className="flex gap-2 mb-3">
          {[3, 4, 5].map((yr) => (
            <button
              key={yr}
              onClick={() => set('holdingPeriod')(yr)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: inputs.holdingPeriod === yr ? '#8b5cf6' : '#12121a',
                color: inputs.holdingPeriod === yr ? '#fff' : '#64748b',
                border: `1px solid ${inputs.holdingPeriod === yr ? '#8b5cf6' : '#1e1e2e'}`,
              }}
            >
              {yr}Y
            </button>
          ))}
        </div>

        <div className="text-xs font-semibold mb-3 mt-2" style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Exit
        </div>

        <Slider
          label="Revenue CAGR During Hold (%)"
          value={inputs.revenueCagr}
          min={5} max={25} step={0.5}
          onChange={set('revenueCagr')}
          suffix="%"
          tooltip="Compound annual growth rate during holding period"
        />

        <Slider
          label="Exit EBITDA Margin (%)"
          value={inputs.exitEbitdaMargin}
          min={5} max={50} step={0.5}
          onChange={set('exitEbitdaMargin')}
          suffix="%"
          tooltip="EBITDA margin at exit (usually higher than entry due to operational improvements)"
        />

        <Slider
          label="Exit EV/EBITDA Multiple"
          value={inputs.exitMultiple}
          min={6} max={20} step={0.5}
          onChange={set('exitMultiple')}
          suffix="x"
          tooltip="Exit sale multiple — what the company is sold for"
        />

        <Slider
          label="Management Fee % of EBITDA"
          value={inputs.mgmtFee}
          min={1} max={3} step={0.25}
          onChange={set('mgmtFee')}
          suffix="%"
          tooltip="Annual management fee charged by PE firm as % of EBITDA"
        />
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {!result ? (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: '#475569' }}>
            Adjust inputs to see LBO analysis
          </div>
        ) : (
          <>
            {/* Returns summary */}
            <div className="grid grid-cols-3 gap-4 mb-5">
              {/* IRR badge */}
              <ReturnsBadge irr={result.irr} />

              {/* MoM */}
              <div
                className="flex flex-col items-center justify-center rounded-xl p-4"
                style={{
                  background: result.mom >= 2 ? 'rgba(59,130,246,0.1)' : 'rgba(100,116,139,0.1)',
                  border: `1px solid ${result.mom >= 2 ? 'rgba(59,130,246,0.3)' : '#1e1e2e'}`,
                }}
              >
                <div className="text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>
                  <Tooltip2 label="Exit equity divided by entry equity — total multiple on invested capital">
                    Money-on-Money
                  </Tooltip2>
                </div>
                <div className="text-3xl font-extrabold" style={{ color: result.mom >= 2 ? '#60a5fa' : '#94a3b8' }}>
                  {result.mom.toFixed(2)}x
                </div>
                <div className="text-xs mt-1" style={{ color: '#475569' }}>
                  {inputs.holdingPeriod}Y holding period
                </div>
              </div>

              {/* Equity bridge */}
              <div
                className="rounded-xl p-4"
                style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
              >
                <div className="text-xs mb-3 font-medium" style={{ color: '#64748b' }}>Equity Bridge</div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: '#64748b' }}>Entry Equity</span>
                    <span style={{ color: '#e2e8f0' }}>{formatCroreCompact(result.entryEquity)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: '#64748b' }}>Exit Equity</span>
                    <span style={{ color: '#e2e8f0' }}>{formatCroreCompact(result.exitEquity)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: '#64748b' }}>Value Created</span>
                    <span style={{ color: result.exitEquity >= result.entryEquity ? '#22c55e' : '#ef4444' }}>
                      {formatCroreCompact(result.exitEquity - result.entryEquity)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Key metrics grid */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Entry EV', value: formatCroreCompact(result.entryEV), tooltip: 'Enterprise Value at acquisition' },
                { label: 'Exit EV', value: formatCroreCompact(result.exitEV), tooltip: 'Enterprise Value at exit' },
                { label: 'Entry Debt', value: formatCroreCompact(result.entryDebt), tooltip: 'Total acquisition debt' },
                { label: 'Exit Debt', value: formatCroreCompact(result.exitDebt), tooltip: 'Remaining debt at exit after amortization' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl p-3"
                  style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
                >
                  <div className="text-xs mb-1" style={{ color: '#64748b' }}>
                    <Tooltip2 label={item.tooltip}>{item.label}</Tooltip2>
                  </div>
                  <div className="text-lg font-bold" style={{ color: '#f1f5f9' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Debt schedule */}
            <div
              className="rounded-xl overflow-hidden mb-5"
              style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
            >
              <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e1e2e' }}>
                <span className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>
                  📋 Debt Schedule (₹ Crore)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: '#0d0d15', borderBottom: '1px solid #1e1e2e' }}>
                      {['Year', 'Revenue', 'EBITDA', 'Mgmt Fee', 'Interest', 'Debt Repaid', 'Debt Balance'].map((h) => (
                        <th key={h} className="px-3 py-2 text-right font-medium first:text-left" style={{ color: '#64748b' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.schedule.map((row) => (
                      <tr
                        key={row.year}
                        style={{ borderBottom: '1px solid #1a1a2a' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#161622')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="px-3 py-2 text-left font-semibold" style={{ color: '#60a5fa' }}>
                          Year {row.year}
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: '#e2e8f0' }}>
                          {row.revenue.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: '#e2e8f0' }}>
                          {row.ebitda.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: '#f59e0b' }}>
                          ({row.mgmtFee.toLocaleString('en-IN')})
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: '#ef4444' }}>
                          ({row.interest.toLocaleString('en-IN')})
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: '#22c55e' }}>
                          {row.debtRepaid.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: '#a78bfa' }}>
                          {row.debtBalance.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Waterfall chart */}
            <div
              className="rounded-xl p-5"
              style={{ background: '#12121a', border: '1px solid #1e1e2e' }}
            >
              <h3 className="text-sm font-semibold mb-4" style={{ color: '#f1f5f9' }}>
                Equity Waterfall (₹ Cr)
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={waterfallData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v) => `₹${(v / 100).toFixed(0)}Cr`}
                    tick={{ fill: '#475569', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v, name) => [`₹${v.toLocaleString('en-IN')} Cr`, name]}
                    contentStyle={{ background: '#1e1e2e', border: '1px solid #2d2d45', borderRadius: 8 }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {waterfallData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="h-6" />
          </>
        )}
      </div>
    </div>
  );
}
