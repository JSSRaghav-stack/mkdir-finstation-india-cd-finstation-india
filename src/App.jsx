import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import CompanyIntel from './pages/CompanyIntel.jsx';
import AIResearch from './pages/AIResearch.jsx';
import DCFValuation from './pages/DCFValuation.jsx';
import LBOAnalyzer from './pages/LBOAnalyzer.jsx';
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'company', label: 'Company Intel', icon: '🔍' },
  { id: 'ai', label: 'AI Research', icon: '🤖' },
  { id: 'dcf', label: 'DCF Valuation', icon: '📊' },
  { id: 'lbo', label: 'LBO Analyzer', icon: '💼' },
];

const BOTTOM_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'company', label: 'Company', icon: '🔍' },
  { id: 'ai', label: 'AI', icon: '🤖' },
  { id: 'dcf', label: 'DCF', icon: '📊' },
  { id: 'lbo', label: 'LBO', icon: '💼' },
];

const SUBTITLES = {
  dashboard: 'Indian Equity Markets Overview',
  company: 'NSE/BSE Stock Analysis',
  ai: 'AI-Powered Equity Research Reports',
  dcf: 'Discounted Cash Flow Valuation Model',
  lbo: 'Leveraged Buyout Analysis',
};

function SplashScreen({ visible, fadeOut }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut ? 0 : 1,
        transition: fadeOut ? 'opacity 0.6s ease-out' : 'opacity 0.4s ease-in',
        pointerEvents: visible ? 'all' : 'none',
      }}
    >
      <style>{`
        @keyframes splashFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes loadingBar {
          0% { width: 0%; }
          60% { width: 70%; }
          85% { width: 88%; }
          100% { width: 100%; }
        }
        @keyframes subtitleFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .splash-logo {
          animation: splashFadeIn 0.5s ease-out 0.1s both;
        }
        .splash-subtitle {
          animation: subtitleFadeIn 0.5s ease-out 0.35s both;
        }
        .splash-tagline {
          animation: subtitleFadeIn 0.5s ease-out 0.55s both;
        }
        .splash-bar-track {
          animation: subtitleFadeIn 0.4s ease-out 0.7s both;
        }
        .splash-bar-fill {
          animation: loadingBar 2.1s cubic-bezier(0.4,0,0.2,1) 0.75s both;
        }
      `}</style>

      {/* Logo mark + wordmark */}
      <div className="splash-logo" style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{
          width: 72,
          height: 72,
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 36,
          fontWeight: 800,
          color: '#fff',
          boxShadow: '0 0 40px rgba(59,130,246,0.4)',
          margin: '0 auto 20px',
        }}>F</div>

        {/* Gradient "Finstation" text */}
        <div style={{
          fontSize: 40,
          fontWeight: 800,
          letterSpacing: '-0.5px',
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textAlign: 'center',
          lineHeight: 1,
        }}>
          Finstation
        </div>
      </div>

      {/* Subtitle */}
      <div className="splash-subtitle" style={{
        fontSize: 15,
        fontWeight: 500,
        color: '#94a3b8',
        letterSpacing: '0.02em',
        textAlign: 'center',
        marginBottom: 8,
      }}>
        AI-Powered Finance Platform
      </div>

      {/* Tagline */}
      <div className="splash-tagline" style={{
        fontSize: 13,
        fontWeight: 400,
        color: '#3b82f6',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        textAlign: 'center',
        marginBottom: 60,
      }}>
        For Indian Equities
      </div>

      {/* Loading bar at bottom */}
      <div className="splash-bar-track" style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'rgba(59,130,246,0.1)',
      }}>
        <div className="splash-bar-fill" style={{
          height: '100%',
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
          borderRadius: '0 2px 2px 0',
          width: 0,
        }} />
      </div>
    </div>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFadeOut, setSplashFadeOut] = useState(false);

  // Splash screen timing: fade out at 2.5s, unmount at 3.1s
  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setSplashFadeOut(true);
    }, 2500);
    const removeTimer = setTimeout(() => {
      setSplashVisible(false);
    }, 3100);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  // Close sidebar on resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleNavClick = (id) => {
    setActiveSection(id);
    setSidebarOpen(false); // close sidebar on mobile after selection
  };

  return (
    <>
      {/* Splash screen overlay */}
      {splashVisible && <SplashScreen visible={splashVisible} fadeOut={splashFadeOut} />}

      <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#0a0a0f', color: '#e2e8f0' }}>

        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 md:hidden"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — always hidden on mobile unless opened via hamburger */}
        <aside
          className="flex flex-col flex-shrink-0 h-full fixed md:relative z-40 transition-transform duration-300"
          style={{
            width: 220,
            background: '#0d0d15',
            borderRight: '1px solid #1e1e2e',
          }}
        >
          {/* Mobile: slide in/out. Desktop: always visible. */}
          <style>{`
            @media (max-width: 767px) {
              aside {
                transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'};
              }
            }
          `}</style>

          <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid #1e1e2e' }}>
            <div className="flex items-center justify-center text-lg font-bold"
              style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 8, flexShrink: 0 }}>F</div>
            <div>
              <div className="font-bold text-sm leading-tight" style={{ color: '#f1f5f9' }}>FinStation</div>
              <div className="text-xs" style={{ color: '#3b82f6' }}>India</div>
            </div>
          </div>

          <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
            {NAV_ITEMS.map(item => {
              const active = activeSection === item.id;
              return (
                <button key={item.id} onClick={() => handleNavClick(item.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 w-full text-left"
                  style={{ background: active ? 'rgba(59,130,246,0.15)' : 'transparent', color: active ? '#60a5fa' : '#64748b', border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent' }}>
                  <span className="text-base w-5 text-center">{item.icon}</span>
                  <span>{item.label}</span>
                  {active && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: '#3b82f6' }} />}
                </button>
              );
            })}
          </nav>

          <div className="px-4 py-4" style={{ borderTop: '1px solid #1e1e2e' }}>
            <div className="text-xs" style={{ color: '#334155' }}>
              <div className="font-medium mb-0.5" style={{ color: '#475569' }}>FinStation India</div>
              <div>AI Equity Research</div>
              <div className="mt-1" style={{ color: '#1e3a5f' }}>v2.0 • NSE/BSE Data</div>
            </div>
          </div>
        </aside>

        {/* Main content — on mobile, full width since sidebar is overlaid */}
        <main className="flex-1 flex flex-col overflow-hidden w-full">
          <div className="flex items-center justify-between px-4 md:px-6 py-3 flex-shrink-0"
            style={{ background: '#0d0d15', borderBottom: '1px solid #1e1e2e' }}>

            <div className="flex items-center gap-3">
              {/* Hamburger — mobile only, opens sidebar (which includes Settings) */}
              <button
                className="flex flex-col gap-1 p-1.5 rounded-lg md:hidden"
                style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}
                onClick={() => setSidebarOpen(o => !o)}
                aria-label="Toggle menu"
              >
                <span style={{ display: 'block', width: 16, height: 2, background: '#60a5fa', borderRadius: 2 }} />
                <span style={{ display: 'block', width: 16, height: 2, background: '#60a5fa', borderRadius: 2 }} />
                <span style={{ display: 'block', width: 16, height: 2, background: '#60a5fa', borderRadius: 2 }} />
              </button>

              <div>
                <h1 className="font-semibold text-sm" style={{ color: '#f1f5f9' }}>{NAV_ITEMS.find(n => n.id === activeSection)?.icon} {NAV_ITEMS.find(n => n.id === activeSection)?.label}</h1>
                <p className="text-xs hidden md:block" style={{ color: '#475569' }}>{SUBTITLES[activeSection]}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <div className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>● NSE</div>
              <div className="text-xs hidden md:block" style={{ color: '#475569' }}>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            </div>
          </div>

          {/* Content area — on mobile add padding-bottom so content isn't obscured by bottom nav */}
          <div className="main-content-area flex-1 overflow-hidden">
            <style>{`
              @media (max-width: 767px) {
                .main-content-area > div[class*="overflow-y-auto"],
                .main-content-area > div[class*="overflow-hidden"] > div[class*="overflow-y-auto"] {
                  padding-bottom: 64px !important;
                }
              }
            `}</style>
            {activeSection === 'dashboard' && <Dashboard />}
            {activeSection === 'company' && <CompanyIntel />}
            {activeSection === 'ai' && <AIResearch />}
            {activeSection === 'dcf' && <DCFValuation />}
            {activeSection === 'lbo' && <LBOAnalyzer />}
          </div>
        </main>

        {/* Bottom navigation bar — mobile only (< 768px) */}
        <nav
          className="md:hidden"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: '#0d0d15',
            borderTop: '1px solid #1e1e2e',
            display: 'flex',
            alignItems: 'stretch',
            height: 56,
          }}
        >
          {BOTTOM_NAV_ITEMS.map(item => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  minHeight: 48,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 2px',
                  position: 'relative',
                }}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
              >
                {/* Active top indicator bar */}
                {active && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: '20%',
                    right: '20%',
                    height: 2,
                    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                    borderRadius: '0 0 2px 2px',
                  }} />
                )}

                {/* Icon + label pill */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  padding: '4px 12px',
                  borderRadius: 10,
                  background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                  minWidth: 40,
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: active ? 600 : 400,
                    color: active ? '#60a5fa' : '#64748b',
                    lineHeight: 1,
                    letterSpacing: '0.01em',
                  }}>
                    {item.label}
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
