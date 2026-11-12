import { create } from 'zustand';
import type { Market } from '@setl8/types';

export interface PriceFeed {
  market: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  timestamp: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface MarketStore {
  selectedMarket: Market;
  prices: Partial<Record<Market, PriceFeed>>;
  setSelectedMarket: (market: Market) => void;
  updatePrice: (market: Market, feed: Partial<PriceFeed> & { price: number }) => void;
  updatePrices: (prices: Record<string, number>) => void;
}

export const useMarketStore = create<MarketStore>((set) => ({
  selectedMarket: 'BTC' as Market,
  prices: {},

  setSelectedMarket: (market: Market) => set({ selectedMarket: market }),

  updatePrice: (market: Market, feed: Partial<PriceFeed> & { price: number }) =>
    set((state) => {
      const existing = state.prices[market];
      return {
        prices: {
          ...state.prices,
          [market]: {
            market,
            change: 0,
            changePercent: 0,
            high: feed.price,
            low: feed.price,
            timestamp: Date.now(),
            ...existing,
            ...feed,
          },
        },
      };
    }),

  updatePrices: (prices: Record<string, number>) =>
    set((state) => {
      const updated = { ...state.prices };
      for (const [market, price] of Object.entries(prices)) {
        const existing = updated[market as Market];
        updated[market as Market] = {
          market,
          price,
          change: existing?.change ?? 0,
          changePercent: existing?.changePercent ?? 0,
          high: Math.max(existing?.high ?? price, price),
          low: Math.min(existing?.low ?? price, price),
          timestamp: Date.now(),
        };
      }
      return { prices: updated };
    }),
}));
