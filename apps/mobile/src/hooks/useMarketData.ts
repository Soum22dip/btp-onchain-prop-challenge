import { useMarketStore } from '@/store/market';
import type { Market } from '@setl8/types';
import type { PriceFeed } from '@/store/market';

export function useMarketData(market: Market): PriceFeed | undefined {
  return useMarketStore((s) => s.prices[market]);
}

export function useSelectedMarket(): Market {
  return useMarketStore((s) => s.selectedMarket);
}

export function useAllPrices(): Partial<Record<Market, PriceFeed>> {
  return useMarketStore((s) => s.prices);
}
