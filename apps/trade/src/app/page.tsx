'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSocket } from '@/hooks/useSocket';
import { usePriceFeed } from '@/hooks/usePriceFeed';
import { useChallenge } from '@/hooks/useChallenge';
import { TopBar } from '@/components/terminal/TopBar';
import { MarketSidebar } from '@/components/terminal/MarketSidebar';
import { AccountBar } from '@/components/terminal/AccountBar';
import { OrderForm } from '@/components/terminal/OrderForm';
import { PositionsList } from '@/components/terminal/PositionsList';
import { TimeframeSelector } from '@/components/terminal/TimeframeSelector';
import { cn } from '@/lib/utils';

const Chart = dynamic(() => import('@/components/terminal/Chart'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-[#08080F]">
      <div className="w-5 h-5 border-2 border-[#7C3AED]/30 border-t-[#7C3AED] rounded-full animate-spin" />
    </div>
  ),
});

type MobileTab = 'trade' | 'positions';

export default function TradePage() {
  useSocket();
  usePriceFeed();
  useChallenge();

  const [mobileTab, setMobileTab] = useState<MobileTab>('trade');

  return (
    <>
      {/* ================================================================= */}
      {/* Desktop layout (md+) — unchanged */}
      {/* ================================================================= */}
      <div className="hidden md:flex flex-col h-screen overflow-hidden bg-[#08080F]">
        <TopBar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar — fixed width 192px */}
          <div className="w-48 shrink-0 overflow-y-auto border-r border-white/[0.06]">
            <MarketSidebar />
          </div>

          {/* Center — chart */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <TimeframeSelector />
            <div className="flex-1 min-h-0 overflow-hidden">
              <Chart />
            </div>
            <AccountBar />
          </div>

          {/* Right panel — order + positions (320px) */}
          <div className="w-80 shrink-0 flex flex-col border-l border-white/[0.06] bg-white/[0.015] overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <OrderForm />
            </div>
            <div className="border-t border-white/[0.06] max-h-[40%] overflow-y-auto">
              <PositionsList />
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Mobile layout (<md) — stacked with tabs */}
      {/* ================================================================= */}
      <div className="flex md:hidden flex-col h-screen overflow-hidden bg-[#08080F]">
        {/* Compact top bar */}
        <TopBar />

        {/* Account bar */}
        <AccountBar />

        {/* Chart — fixed height */}
        <div className="shrink-0">
          <TimeframeSelector />
          <div className="h-[250px] w-full">
            <Chart />
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 border-t border-white/[0.06] bg-[#0d0d1a]">
          {([
            { id: 'trade' as MobileTab, label: 'Trade' },
            { id: 'positions' as MobileTab, label: 'Positions' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setMobileTab(t.id)}
              className={cn(
                'flex-1 h-11 text-sm font-semibold transition-all',
                mobileTab === t.id
                  ? 'bg-[#7C3AED] text-white'
                  : 'bg-[#1a1a2e] text-gray-400',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content — fills remaining space */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {mobileTab === 'trade' ? (
            <OrderForm />
          ) : (
            <PositionsList />
          )}
        </div>
      </div>
    </>
  );
}
