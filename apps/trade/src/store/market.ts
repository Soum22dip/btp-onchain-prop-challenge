import { create } from 'zustand';
import type { UTCTimestamp } from 'lightweight-charts';
import type { Market } from '@setl8/types';

// ---------------------------------------------------------------------------
// Local types — NOT from @setl8/types
// ---------------------------------------------------------------------------

export interface PriceFeed {
  market: string;
  price: number;
  confidence: number;
  timestamp: number; // unix ms
}

export interface CandleData {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ---------------------------------------------------------------------------
// Timeframe types
// ---------------------------------------------------------------------------

export interface TimeframeOption {
  label: string;
  interval: string; // API interval value
  seconds: number;  // seconds per candle for live tick bucketing
}

export const TIMEFRAMES: TimeframeOption[] = [
  { label: '1m', interval: '1', seconds: 60 },
  { label: '5m', interval: '5', seconds: 300 },
  { label: '15m', interval: '15', seconds: 900 },
  { label: '1H', interval: '60', seconds: 3600 },
  { label: '4H', interval: '240', seconds: 14400 },
  { label: '1D', interval: 'D', seconds: 86400 },
];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface MarketStore {
  selectedMarket: Market;
  selectedTimeframe: TimeframeOption;
  prices: Partial<Record<Market, PriceFeed>>;
  candles: CandleData[];
  setSelectedMarket: (m: Market) => void;
  setSelectedTimeframe: (tf: TimeframeOption) => void;
  updatePrice: (market: Market, feed: PriceFeed) => void;
  updatePrices: (feeds: Partial<Record<Market, PriceFeed>>) => void;
  setCandles: (candles: CandleData[]) => void;
  appendCandle: (candle: CandleData) => void;
}

export const useMarketStore = create<MarketStore>((set) => ({
  selectedMarket: 'BTC' as Market,
  selectedTimeframe: TIMEFRAMES[3], // default 1H
  prices: {},
  candles: [],

  setSelectedMarket: (m: Market) => set({ selectedMarket: m }),
  setSelectedTimeframe: (tf: TimeframeOption) => set({ selectedTimeframe: tf }),

  updatePrice: (market: Market, feed: PriceFeed) =>
    set((state) => ({
      prices: { ...state.prices, [market]: feed },
    })),

  updatePrices: (feeds: Partial<Record<Market, PriceFeed>>) =>
    set((state) => ({
      prices: { ...state.prices, ...feeds },
    })),

  setCandles: (candles: CandleData[]) => set({ candles }),

  appendCandle: (candle: CandleData) =>
    set((state) => {
      const existing = state.candles;
      if (existing.length === 0) return { candles: [candle] };
      const last = existing[existing.length - 1];
      if (last.time === candle.time) {
        // Update the last candle
        return {
          candles: [...existing.slice(0, -1), candle],
        };
      }
      return { candles: [...existing, candle] };
    }),
}));
