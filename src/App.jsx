import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Search,
  BrainCircuit,
  TrendingUp,
  Briefcase,
  Menu,
  X,
  Activity,
} from 'lucide-react';
import Dashboard from './pages/Dashboard.jsx';
import CompanyIntel from './pages/CompanyIntel.jsx';
import AIResearch from './pages/AIResearch.jsx';
import DCFValuation from './pages/DCFValuation.jsx';
import LBOAnalyzer from './pages/LBOAnalyzer.jsx';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',     icon: LayoutDashboard, short: 'Home'    },
  { id: 'company',   label: 'Company Intel', icon: Search,          short: 'Company' },
  { id: 'ai',        label: 'AI Research',   icon: BrainCircuit,    short: 'AI'      },
  { id: 'dcf',       label: 'DCF Valuation', icon: TrendingUp,      short: 'DCF'     },
  { id: 'lbo',       label: 'LBO Analyzer',  icon: Briefcase,       short: 'LBO'     },
];

const SUBTITLES = {
  dashboard: 'Indian Equity Markets Overview',
  company:   'NSE/BSE Stock Analysis',
  ai:        'AI-Powered Equity Research',
  dcf:       'Discounted Cash Flow Valuation',
  lbo:       'Leveraged Buyout Analysis',
};

// ─── FinStation Logo Mark (F + upward arrow, blue gradient) ──────────────────
function LogoMark({ size = 36, showText = false }) {
  const s = size;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s * 0.32, flexShrink: 0 }}>
      {/* Icon: F-bracket with trending arrow */}
      <svg width={s} height={s} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="fg1" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1565C0"/>
            <stop offset="55%" stopColor="#2196F3"/>
            <stop offset="100%" stopColor="#42A5F5"/>
          </linearGradient>
          <linearGradient id="fg2" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0D47A1"/>
            <stop offset="100%" stopColor="#1976D2"/>
          </linearGradient>
          <filter id="fglow">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {/* F bracket — vertical bar */}
        <rect x="14" y="12" width="14" height="76" rx="4" fill="url(#fg2)"/>
        {/* F top horizontal */}
        <rect x="14" y="12" width="52" height="14" rx="4" fill="url(#fg1)"/>
        {/* F mid horizontal */}
        <rect x="14" y="44" width="36" height="12" rx="4" fill="url(#fg1)"/>
        {/* Trending-up arrow line: low-left to high-right */}
        <polyline
          points="30,72 48,52 62,62 82,28"
          stroke="url(#fg1)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"
          fill="none" filter="url(#fglow)"
        />
        {/* Arrowhead */}
        <polygon points="82,28 68,26 80,40" fill="url(#fg1)" filter="url(#fglow)"/>
      </svg>

      {/* Wordmark — only when showText=true (sidebar/splash) */}
      {showText && (
        <span style={{
          fontSize: s * 0.52,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: '#f1f5f9',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}>
          Fin<span style={{ color: '#42A5F5' }}>Station</span>
        </span>
      )}
    </div>
  );
}

// ─── Splash Screen ────────────────────────────────────────────────────────────
function SplashScreen({ visible, fadeOut }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#0a0a0f',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: fadeOut ? 0 : 1,
      transition: fadeOut ? 'opacity 0.6s ease-out' : 'opacity 0.4s ease-in',
      pointerEvents: visible ? 'all' : 'none',
    }}>
      <style>{`
        @keyframes splashIn   { from { opacity:0; transform:translateY(18px) scale(0.96); } to { opacity:1; transform:none; } }
        @keyframes subtleIn   { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
        @keyframes loadingBar { 0%{width:0} 60%{width:68%} 85%{width:87%} 100%{width:100%} }
        @keyframes pulse      { 0%,100%{opacity:0.6} 50%{opacity:1} }
        .sp-logo   { animation: splashIn  0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s  both; }
        .sp-name   { animation: subtleIn  0.45s ease-out 0.35s both; }
        .sp-tag    { animation: subtleIn  0.45s ease-out 0.5s  both; }
        .sp-dots   { animation: subtleIn  0.4s  ease-out 0.65s both; }
        .sp-bar    { animation: subtleIn  0.4s  ease-out 0.7s  both; }
        .sp-fill   { animation: loadingBar 2.2s cubic-bezier(0.4,0,0.2,1) 0.75s both; }
        .dot-pulse { animation: pulse 1.4s ease-in-out infinite; }
        .dot-pulse:nth-child(2) { animation-delay: 0.2s; }
        .dot-pulse:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      {/* Ambient glow */}
      <div style={{
        position:'absolute', width:400, height:400, borderRadius:'50%',
        background:'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
        pointerEvents:'none',
      }}/>

      <div className="sp-logo" style={{ marginBottom:28, textAlign:'center' }}>
        <LogoMark size={72} showText={true} />
      </div>

      <div className="sp-tag" style={{
        fontSize: 12, fontWeight: 500, color: '#475569',
        letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 40,
      }}>
        India · AI Equity Intelligence
      </div>

      {/* loading dots */}
      <div className="sp-dots" style={{ display:'flex', gap:6, marginBottom:8 }}>
        {[0,1,2].map(i => (
          <div key={i} className="dot-pulse" style={{
            width:6, height:6, borderRadius:'50%',
            background:'linear-gradient(135deg,#6366f1,#a78bfa)',
          }}/>
        ))}
      </div>

      {/* loading bar */}
      <div className="sp-bar" style={{
        position:'absolute', bottom:0, left:0, right:0,
        height:2, background:'rgba(99,102,241,0.08)',
      }}>
        <div className="sp-fill" style={{
          height:'100%', width:0,
          background:'linear-gradient(90deg,#6366f1,#818cf8,#a78bfa)',
          borderRadius:'0 2px 2px 0',
        }}/>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFadeOut, setSplashFadeOut] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setSplashFadeOut(true),  1800);
    const t2 = setTimeout(() => setSplashVisible(false), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setSidebarOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleNavClick = (id) => { setActiveSection(id); setSidebarOpen(false); };

  const activeItem = NAV_ITEMS.find(n => n.id === activeSection);

  return (
    <>
      {splashVisible && <SplashScreen visible={splashVisible} fadeOut={splashFadeOut} />}

      <style>{`
        :root {
          --bg-base:    #0a0a0f;
          --bg-surface: #0f0f18;
          --bg-card:    #13131e;
          --border:     #1e1e30;
          --border-act: rgba(99,102,241,0.35);
          --accent:     #6366f1;
          --accent-hi:  #818cf8;
          --text-1:     #f1f5f9;
          --text-2:     #94a3b8;
          --text-3:     #475569;
        }

        /* Sidebar mobile slide */
        @media (max-width:767px) {
          .sidebar-panel {
            transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'} !important;
          }
        }

        /* Nav hover */
        .nav-btn { transition: background 0.15s, color 0.15s, border-color 0.15s; }
        .nav-btn:hover:not(.active) {
          background: rgba(99,102,241,0.07) !important;
          color: #a5b4fc !important;
        }

        /* Bottom nav btn */
        .bot-btn { transition: color 0.15s; }
        .bot-btn:hover { color: #a5b4fc; }

        /* Slider thumb */
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #a78bfa);
          box-shadow: 0 0 8px rgba(99,102,241,0.5);
          cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 14px; height: 14px; border: none;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #a78bfa);
          cursor: pointer;
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e1e30; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #2d2d45; }

        /* Tooltip */
        .tooltip-container { position: relative; display: inline-flex; align-items: center; }
        .tooltip-text {
          visibility: hidden; opacity: 0;
          position: absolute; bottom: calc(100% + 6px); left: 50%;
          transform: translateX(-50%);
          background: #1e1e30; color: #cbd5e1;
          border: 1px solid #2d2d45; border-radius: 6px;
          padding: 5px 10px; font-size: 11px; white-space: nowrap;
          pointer-events: none; transition: opacity 0.15s; z-index: 100;
        }
        .tooltip-container:hover .tooltip-text { visibility: visible; opacity: 1; }

        /* Mobile content padding for bottom nav */
        @media (max-width:767px) {
          .main-content-area > div[class*="overflow-y-auto"],
          .main-content-area > div[class*="overflow-hidden"] > div[class*="overflow-y-auto"] {
            padding-bottom: 68px !important;
          }
        }
      `}</style>

      <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}>

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 md:hidden"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)' }}
            onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Sidebar ── */}
        <aside
          className="sidebar-panel flex flex-col flex-shrink-0 h-full fixed md:relative z-40"
          style={{
            width: 224,
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--border)',
            transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          {/* Logo header */}
          <div style={{ padding: '20px 16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LogoMark size={34} showText={true} />
            </div>

            {/* Live market pulse */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginTop: 12, padding: '5px 10px', borderRadius: 8,
              background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: '#22c55e', letterSpacing: '0.08em' }}>NSE · LIVE</span>
              <Activity size={10} color="#22c55e" style={{ marginLeft: 'auto' }} />
            </div>
          </div>

          {/* Navigation */}
          <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = activeSection === id;
              return (
                <button
                  key={id}
                  onClick={() => handleNavClick(id)}
                  className={`nav-btn${active ? ' active' : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 10, width: '100%', textAlign: 'left',
                    border: active ? '1px solid var(--border-act)' : '1px solid transparent',
                    background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: active ? '#a5b4fc' : 'var(--text-3)',
                    fontSize: 13, fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  <Icon
                    size={16}
                    strokeWidth={active ? 2.2 : 1.8}
                    color={active ? '#818cf8' : '#475569'}
                    style={{ flexShrink: 0 }}
                  />
                  <span style={{ flex: 1 }}>{label}</span>
                  {active && (
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                      boxShadow: '0 0 6px rgba(99,102,241,0.6)',
                    }} />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              FinStation India
            </div>
            <div style={{ fontSize: 10, color: '#334155' }}>
              AI Equity Intelligence · v2.1
            </div>
            <div style={{
              marginTop: 8, height: 2, borderRadius: 2,
              background: 'linear-gradient(90deg, #6366f1, #a78bfa, transparent)',
              opacity: 0.4,
            }} />
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 flex flex-col overflow-hidden w-full">

          {/* Top header */}
          <header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', height: 54, flexShrink: 0,
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Hamburger — mobile only */}
              <button
                className="md:hidden"
                onClick={() => setSidebarOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 34, borderRadius: 8,
                  background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                  cursor: 'pointer', flexShrink: 0,
                }}
                aria-label="Toggle menu"
              >
                {sidebarOpen ? <X size={16} color="#818cf8" /> : <Menu size={16} color="#818cf8" />}
              </button>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {activeItem && <activeItem.icon size={14} color="#6366f1" strokeWidth={2.2} />}
                  <h1 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.1px' }}>
                    {activeItem?.label}
                  </h1>
                </div>
                <p className="hidden md:block" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                  {SUBTITLES[activeSection]}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                background: 'rgba(34,197,94,0.08)', color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.2)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
                NSE
              </div>
              <div className="hidden md:block" style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </header>

          {/* Page content */}
          <div className="main-content-area flex-1 overflow-hidden">
            {activeSection === 'dashboard' && <Dashboard />}
            {activeSection === 'company'   && <CompanyIntel />}
            {activeSection === 'ai'        && <AIResearch />}
            {activeSection === 'dcf'       && <DCFValuation />}
            {activeSection === 'lbo'       && <LBOAnalyzer />}
          </div>
        </main>

        {/* ── Bottom nav — mobile only ── */}
        <nav className="md:hidden" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'stretch', height: 58,
        }}>
          {NAV_ITEMS.map(({ id, label, icon: Icon, short }) => {
            const active = activeSection === id;
            return (
              <button
                key={id}
                className="bot-btn"
                onClick={() => handleNavClick(id)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 4, padding: '4px 2px',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', position: 'relative',
                  color: active ? '#818cf8' : '#475569',
                }}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
              >
                {/* Active indicator */}
                {active && (
                  <div style={{
                    position: 'absolute', top: 0,
                    left: '18%', right: '18%', height: 2,
                    background: 'linear-gradient(90deg,#6366f1,#a78bfa)',
                    borderRadius: '0 0 3px 3px',
                  }} />
                )}
                <div style={{
                  padding: '3px 10px', borderRadius: 8,
                  background: active ? 'rgba(99,102,241,0.1)' : 'transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                }}>
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.7} />
                  <span style={{ fontSize: 9, fontWeight: active ? 700 : 400, letterSpacing: '0.03em' }}>
                    {short}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
