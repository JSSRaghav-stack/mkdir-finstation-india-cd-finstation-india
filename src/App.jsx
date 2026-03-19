import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import CompanyIntel from './pages/CompanyIntel.jsx';
import AIResearch from './pages/AIResearch.jsx';
import DCFValuation from './pages/DCFValuation.jsx';
import LBOAnalyzer from './pages/LBOAnalyzer.jsx';
import Settings from './pages/Settings.jsx';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'company', label: 'Company Intel', icon: '🔍' },
  { id: 'ai', label: 'AI Research', icon: '🤖' },
  { id: 'dcf', label: 'DCF Valuation', icon: '📊' },
  { id: 'lbo', label: 'LBO Analyzer', icon: '💼' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

const SUBTITLES = {
  dashboard: 'Indian Equity Markets Overview',
  company: 'NSE/BSE Stock Analysis',
  ai: 'AI-Powered Equity Research Reports',
  dcf: 'Discounted Cash Flow Valuation Model',
  lbo: 'Leveraged Buyout Analysis',
  settings: 'API Keys & Data Sources',
};

export default function App() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    setSidebarOpen(false); // close on mobile after selection
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#0a0a0f', color: '#e2e8f0' }}>

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0 h-full fixed md:relative z-40 transition-transform duration-300"
        style={{
          width: 220,
          background: '#0d0d15',
          borderRight: '1px solid #1e1e2e',
          transform: sidebarOpen ? 'translateX(0)' : undefined,
        }}
      >
        {/* On mobile: hidden by default via CSS, shown when sidebarOpen */}
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
            {/* Hamburger — mobile only */}
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

        <div className="flex-1 overflow-hidden">
          {activeSection === 'dashboard' && <Dashboard />}
          {activeSection === 'company' && <CompanyIntel />}
          {activeSection === 'ai' && <AIResearch />}
          {activeSection === 'dcf' && <DCFValuation />}
          {activeSection === 'lbo' && <LBOAnalyzer />}
          {activeSection === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
}
