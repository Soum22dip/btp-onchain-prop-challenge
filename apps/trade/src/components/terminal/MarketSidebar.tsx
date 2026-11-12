'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Search } from 'lucide-react';
import {
  MARKET_CATEGORY,
  MARKET_DISPLAY_NAME,
  NON_CRYPTO_MARKETS,
  MarketCategory,
} from '@setl8/constants';
import { Market } from '@setl8/types';
import { useMarketStore } from '@/store/market';
import { isWeekend, formatPrice, cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// MarketSidebar — glassmorphism with tablet collapse
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = [
  MarketCategory.CRYPTO,
  MarketCategory.FOREX,
  MarketCategory.METALS,
  MarketCategory.INDICES,
] as const;

const CATEGORY_LABELS: Record<MarketCategory, string> = {
  [MarketCategory.CRYPTO]: 'CRYPTO',
  [MarketCategory.METALS]: 'METALS',
  [MarketCategory.INDICES]: 'INDICES',
  [MarketCategory.FOREX]: 'FOREX',
};

const ALL_MARKETS = Object.values(Market) as Market[];

function getSimulated24hChange(market: Market, price: number): number {
  if (price <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < market.length; i++) {
    hash = ((hash << 5) - hash + market.charCodeAt(i)) | 0;
  }
  const normalized = ((hash % 100) / 100) * 8 - 2;
  return normalized;
}

// ---------------------------------------------------------------------------
// MarketRow — memoized
// ---------------------------------------------------------------------------

const MarketRow = React.memo(function MarketRow({
  market,
  isSelected,
  isClosed,
  onSelect,
}: {
  market: Market;
  isSelected: boolean;
  isClosed: boolean;
  onSelect: (m: Market) => void;
}) {
  const priceFeed = useMarketStore((s) => s.prices[market]);
  const price = Number(priceFeed?.price ?? 0);
  const change = getSimulated24hChange(market, price);
  const isPositive = change >= 0;

  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (price <= 0) return;
    const prev = prevRef.current;
    if (prev > 0 && price !== prev) {
      setFlash(price > prev ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 300);
      return () => clearTimeout(t);
    }
    prevRef.current = price;
  }, [price]);

  // Get market symbol (first part before /)
  const symbol = market.replace('_', '/');

  return (
    <button
      onClick={() => onSelect(market)}
      className={cn(
        'w-full flex items-center justify-between px-3 py-2 text-left transition-all duration-200 relative',
        'hover:bg-white/[0.05]',
        isSelected && 'bg-purple-600/[0.12] border-l-2 border-l-[#7C3AED]',
        !isSelected && 'border-l-2 border-l-transparent',
        isClosed && 'opacity-40',
      )}
    >
      {/* Full display on desktop, symbol-only on tablet */}
      <span
        className={cn(
          'text-[11px] font-semibold truncate',
          isSelected ? 'text-white' : 'text-white/70',
        )}
      >
        <span className="hidden xl:inline">{MARKET_DISPLAY_NAME[market]}</span>
        <span className="xl:hidden">{symbol}</span>
      </span>

      <div className="hidden xl:flex items-center gap-2 shrink-0 ml-1">
        {!isClosed && priceFeed && Number(price) > 0 ? (
          <>
            <span
              className={cn(
                'text-[10px] font-mono text-white/60 transition-colors duration-300',
                flash === 'up' && 'text-[#22C55E]',
                flash === 'down' && 'text-[#EF4444]',
              )}
            >
              {formatPrice(Number(price), Number(price) < 1 ? 4 : Number(price) < 100 ? 2 : 0)}
            </span>
            <span
              className={cn(
                'text-[9px] font-mono font-medium',
                isPositive ? 'text-[#22C55E]' : 'text-[#EF4444]',
              )}
            >
              {isPositive ? '+' : ''}
              {Number(change).toFixed(1)}%
            </span>
          </>
        ) : isClosed ? (
          <span className="text-[9px] text-white/20">Closed</span>
        ) : (
          <span className="text-[10px] text-white/20">—</span>
        )}
      </div>
    </button>
  );
});

export function MarketSidebar({ onSelect }: { onSelect?: () => void } = {}) {
  const [search, setSearch] = useState('');
  const selectedMarket = useMarketStore((s) => s.selectedMarket);
  const setSelectedMarket = useMarketStore((s) => s.setSelectedMarket);

  const handleSelect = (m: Market) => {
    setSelectedMarket(m);
    onSelect?.();
  };

  // Compute after mount so server and first client render agree (avoids hydration mismatch)
  const [weekend, setWeekend] = useState(false);
  useEffect(() => { setWeekend(isWeekend()); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return ALL_MARKETS;
    return ALL_MARKETS.filter(
      (m) =>
        m.toLowerCase().includes(q) ||
        MARKET_DISPLAY_NAME[m].toLowerCase().includes(q),
    );
  }, [search]);

  const grouped = useMemo(() => {
    const map = new Map<MarketCategory, Market[]>();
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, []);
    }
    for (const m of filtered) {
      const cat = MARKET_CATEGORY[m];
      const arr = map.get(cat);
      if (arr) arr.push(m);
    }
    return map;
  }, [filtered]);

  return (
    <aside className="h-full flex flex-col bg-white/[0.02] overflow-hidden">
      {/* Search — hidden on tablet */}
      <div className="hidden xl:block px-2.5 py-2.5 border-b border-white/[0.06]">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.15] transition-colors"
          />
        </div>
      </div>

      {/* Market list */}
      <div className="flex-1 overflow-y-auto">
        {CATEGORY_ORDER.map((cat) => {
          const markets = grouped.get(cat) ?? [];
          if (markets.length === 0) return null;

          return (
            <div key={cat}>
              <div className="sticky top-0 z-10 bg-[#08080F]/90 backdrop-blur-sm px-3 py-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/20">
                  <span className="hidden xl:inline">{CATEGORY_LABELS[cat]}</span>
                  <span className="xl:hidden">{CATEGORY_LABELS[cat].slice(0, 3)}</span>
                </span>
              </div>

              {markets.map((market) => {
                const isSelected = market === selectedMarket;
                const isClosed =
                  weekend &&
                  (NON_CRYPTO_MARKETS as readonly string[]).includes(market);

                return (
                  <MarketRow
                    key={market}
                    market={market}
                    isSelected={isSelected}
                    isClosed={isClosed}
                    onSelect={handleSelect}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
