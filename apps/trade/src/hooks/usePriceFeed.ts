'use client';

import { useEffect } from 'react';
import { useMarketStore, type PriceFeed } from '@/store/market';
import type { Market } from '@setl8/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface PriceResponse {
  success: boolean;
  data: Array<{
    market: string;
    price: number;
    confidence: number;
    timestamp: number;
  }>;
}

export function usePriceFeed() {
  const updatePrices = useMarketStore((s) => s.updatePrices);

  useEffect(() => {
    let abortController: AbortController | null = null;

    async function fetchPrices() {
      // Abort any in-flight request before starting a new one
      if (abortController) abortController.abort();
      abortController = new AbortController();

      try {
        const res = await fetch(`${API_URL}/api/prices`, {
          signal: abortController.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as PriceResponse;
        if (!data.success || !Array.isArray(data.data)) return;

        const feeds: Partial<Record<Market, PriceFeed>> = {};
        for (const p of data.data) {
          feeds[p.market as Market] = {
            market: p.market,
            price: p.price,
            confidence: p.confidence,
            timestamp: p.timestamp,
          };
        }
        updatePrices(feeds);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // ignore other network errors
      }
    }

    void fetchPrices();
    const interval = setInterval(() => void fetchPrices(), 3000);
    return () => {
      clearInterval(interval);
      if (abortController) abortController.abort();
    };
  }, [updatePrices]);
}
