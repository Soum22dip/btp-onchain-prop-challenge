'use client';

import React, { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMarketStore } from '@/store/market';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false },
);
import { MARKET_DISPLAY_NAME } from '@setl8/constants';
import { formatPrice, getPriceDecimals, cn } from '@/lib/utils';
import { MarketSidebar } from './MarketSidebar';

// ---------------------------------------------------------------------------
// TopBar — glassmorphism header
// ---------------------------------------------------------------------------

export const TopBar = React.memo(function TopBar() {
  const selectedMarket = useMarketStore((s) => s.selectedMarket);
  const priceFeed = useMarketStore((s) => s.prices[s.selectedMarket]);
  const displayName = MARKET_DISPLAY_NAME[selectedMarket];
  const { connected } = useWallet();

  const [showMarketPicker, setShowMarketPicker] = useState(false);

  // Subtle price flash effect — brief text color change only
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef<number>(0);

  useEffect(() => {
    if (!priceFeed) return;
    const prev = prevPriceRef.current;
    if (prev > 0 && priceFeed.price !== prev) {
      setPriceFlash(priceFeed.price > prev ? 'up' : 'down');
      const timer = setTimeout(() => setPriceFlash(null), 600);
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = priceFeed.price;
  }, [priceFeed?.price]);

  const price = Number(priceFeed?.price ?? 0);
  const decimals = getPriceDecimals(Number(price), selectedMarket);

  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-4 bg-white/[0.02] border-b border-white/[0.06] z-10">
      {/* Left: Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <a
          href="http://setl8.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 group"
        >
          <img src="/logo_bgr.png" alt="Setl8" className="w-6 h-6" />
          <span className="text-[15px] font-bold tracking-wider group-hover:text-[#7C3AED] transition-colors">
            <span className="text-white">SETL</span><span className="text-[#7C3AED]">8</span>
          </span>
        </a>
        <div className="h-4 w-px bg-white/[0.1]" />
        <span className="text-[10px] font-semibold tracking-widest text-white/40 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-md">
          TRADE
        </span>
      </div>

      {/* Center: Market info */}
      <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
        <button
          onClick={() => setShowMarketPicker(!showMarketPicker)}
          className="flex items-center gap-1 md:pointer-events-none"
        >
          <span className="text-xs font-semibold text-white/70 shrink-0 truncate max-w-[100px] md:max-w-none">{displayName}</span>
          <svg className="w-3 h-3 text-white/30 md:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {priceFeed && Number(price) > 0 ? (
          <div className="hidden md:flex items-center gap-3">
            <span
              className={cn(
                'text-base font-semibold font-mono text-white transition-colors duration-500 px-1.5 py-0.5 rounded',
                priceFlash === 'up' && 'text-[#22C55E]',
                priceFlash === 'down' && 'text-[#EF4444]',
              )}
            >
              ${formatPrice(Number(price), decimals)}
            </span>
          </div>
        ) : (
          <span className="hidden md:inline text-xs text-white/25 font-mono">Loading...</span>
        )}
      </div>

      {/* Right: Wallet */}
      <div className="flex items-center gap-2 shrink-0 relative">
        {/* Connected indicator glow */}
        {connected && (
          <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#22C55E] shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
        )}
        <WalletMultiButton className="!bg-[#7C3AED] !rounded-lg !h-8 !px-2 md:!px-4 !text-[10px] md:!text-xs !font-semibold hover:!bg-[#6D28D9] !transition-colors !shadow-lg !shadow-purple-500/20" />
      </div>

      {showMarketPicker && (
        <div className="fixed inset-0 z-50 bg-[#08080F]/95 backdrop-blur-sm md:hidden">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white">Select Market</span>
              <button onClick={() => setShowMarketPicker(false)} className="text-white/50 text-xl">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <MarketSidebar onSelect={() => setShowMarketPicker(false)} />
            </div>
          </div>
        </div>
      )}
    </header>
  );
});
