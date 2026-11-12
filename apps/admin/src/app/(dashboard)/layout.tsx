'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always visible on desktop, toggled on mobile */}
      <div className={`
        fixed inset-y-0 left-0 z-40 md:relative md:z-auto
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile hamburger */}
        <div className="md:hidden sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-white/[0.04] px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo_bgr.png" alt="Setl8" className="w-6 h-6" />
            <span className="font-bold text-sm tracking-wider">
              <span className="text-white">SETL</span><span className="text-[#7C3AED]">8</span>
            </span>
            <span className="bg-[#EF4444]/20 text-[#EF4444] text-[8px] font-bold px-1 py-0.5 rounded uppercase">ADMIN</span>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
