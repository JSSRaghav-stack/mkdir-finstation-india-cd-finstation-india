import React, { useState, useRef, useEffect } from 'react';
import { STOCK_LIST } from '../data/mockData.js';
import { searchStocks } from '../utils/api.js';

/**
 * Reusable searchable stock picker.
 * Props:
 *   value        – current ticker string (e.g. "RELIANCE.NS")
 *   onChange     – (ticker) => void
 *   placeholder  – input placeholder
 *   accentColor  – hex color for highlight (default #6366f1)
 *   disabled     – boolean
 */
export default function StockSearchBox({
  value,
  onChange,
  placeholder = 'Search company or ticker…',
  accentColor = '#6366f1',
  disabled = false,
}) {
  const [query, setQuery]       = useState('');
  const [items, setItems]       = useState([]);
  const [open, setOpen]         = useState(false);
  const [highlighted, setHl]    = useState(-1);
  const inputRef  = useRef(null);
  const wrapRef   = useRef(null);
  const timerRef  = useRef(null);

  // When value changes externally (cleared), reset query
  useEffect(() => {
    if (!value) setQuery('');
    else {
      const found = STOCK_LIST.find(s => s.ticker === value);
      if (found) setQuery(found.name);
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const buildItems = (q) => {
    const lower = q.toLowerCase();
    return STOCK_LIST.filter(
      s => s.name.toLowerCase().includes(lower) || s.ticker.toLowerCase().includes(lower)
    ).slice(0, 12);
  };

  const handleChange = (q) => {
    setQuery(q);
    setHl(-1);

    if (!q.trim()) {
      setItems([]);
      setOpen(false);
      onChange('');
      return;
    }

    const local = buildItems(q);
    setItems(local);
    setOpen(true);

    // Live search debounced
    clearTimeout(timerRef.current);
    if (q.length >= 2) {
      timerRef.current = setTimeout(async () => {
        try {
          const live = await searchStocks(q);
          if (live && live.length > 0) {
            const localTickers = new Set(local.map(s => s.ticker));
            const extras = live.filter(r => !localTickers.has(r.ticker)).slice(0, 4);
            setItems(prev => [...prev.slice(0, 8), ...extras]);
          }
        } catch {}
      }, 350);
    }
  };

  const select = (item) => {
    setQuery(item.name);
    setOpen(false);
    setHl(-1);
    onChange(item.ticker);
  };

  const handleKeyDown = (e) => {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHl(h => Math.min(h + 1, items.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHl(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); if (highlighted >= 0) select(items[highlighted]); }
    if (e.key === 'Escape')    { setOpen(false); setHl(-1); }
  };

  const accentRgb = accentColor.replace('#','');

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 10,
        background: '#0d0d18',
        border: `1px solid ${open ? accentColor + '60' : '#1e1e2e'}`,
        boxShadow: open ? `0 0 0 2px ${accentColor}20` : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        opacity: disabled ? 0.5 : 1,
      }}>
        {/* Search icon */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={open ? accentColor : '#475569'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'stroke 0.15s' }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => { if (query) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#f1f5f9', fontSize: 13, fontWeight: 500,
          }}
        />
        {/* Clear button */}
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false); onChange(''); setItems([]); inputRef.current?.focus(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#475569', lineHeight: 1 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && items.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200,
          background: '#0f0f1a', border: `1px solid #1e1e2e`,
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          maxHeight: 300, overflowY: 'auto',
        }}>
          {items.map((item, idx) => {
            const isHL = idx === highlighted;
            return (
              <div
                key={item.ticker}
                onMouseEnter={() => setHl(idx)}
                onMouseDown={(e) => { e.preventDefault(); select(item); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 14px', cursor: 'pointer',
                  background: isHL ? `${accentColor}18` : 'transparent',
                  borderBottom: '1px solid #12121a',
                  transition: 'background 0.1s',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isHL ? '#f1f5f9' : '#e2e8f0' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>
                    {item.ticker.replace('.NS','').replace('.BO','')} · NSE
                  </div>
                </div>
                {item.sector && (
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                    background: isHL ? `${accentColor}30` : '#1e1e2e',
                    color: isHL ? accentColor : '#475569',
                  }}>{item.sector?.split(' ')[0]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
