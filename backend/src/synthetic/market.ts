// =============================================================================
// Setl8 Backend — MarketService
//
// Thin wrapper around the real price feed (Binance + Finnhub + Metals.live).
// All other backend services read prices exclusively through this service.
// =============================================================================

import { Market } from '@setl8/types';
import {
  type PriceData,
  getLatestPrices,
  getPrice,
  initPriceFeed,
  stopPriceFeed,
} from '../lib/pyth.js';

export { PriceData };

// ---------------------------------------------------------------------------
// MarketService
// ---------------------------------------------------------------------------

class MarketService {
  async init(): Promise<void> {
    await initPriceFeed();
  }

  getPrice(market: Market): PriceData | null {
    return getPrice(market as string) ?? null;
  }

  getAllPrices(): PriceData[] {
    return getLatestPrices();
  }

  stop(): void {
    stopPriceFeed();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const marketService = new MarketService();
