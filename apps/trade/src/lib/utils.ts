import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { NON_CRYPTO_MARKETS } from '@setl8/constants';
import type { Market } from '@setl8/types';

// ---------------------------------------------------------------------------
// cn — Tailwind class merge
// ---------------------------------------------------------------------------

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

export function formatUsd(amount: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatPrice(price: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(price);
}

export function formatPercent(
  value: number,
  decimals = 2,
  showSign = false,
): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));

  if (showSign) {
    const sign = value >= 0 ? '+' : '-';
    return `${sign}${formatted}%`;
  }
  return `${value < 0 ? '-' : ''}${formatted}%`;
}

// ---------------------------------------------------------------------------
// Address formatting
// ---------------------------------------------------------------------------

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// ---------------------------------------------------------------------------
// Price decimal helpers
// ---------------------------------------------------------------------------

/** Returns the appropriate number of decimals for displaying a price */
export function getPriceDecimals(price: number, market?: string): number {
  // Forex JPY pairs — 3 decimals
  if (market && (market.includes('JPY') || market === 'USD_MXN' || market === 'USD_SGD')) {
    return 3;
  }
  // Forex non-JPY — 5 decimals
  if (market && market.includes('_')) {
    return 5;
  }
  // Very small crypto (SHIB, PEPE, BONK, TURBO, NOT)
  if (price > 0 && price < 0.001) return 8;
  if (price > 0 && price < 0.1) return 6;
  if (price > 0 && price < 1) return 6;
  if (price > 0 && price < 100) return 4;
  // High-value crypto / metals / indices ($100+)
  return 2;
}

// ---------------------------------------------------------------------------
// Market hours
// ---------------------------------------------------------------------------

export function isWeekend(): boolean {
  return [0, 6].includes(new Date().getDay());
}

export function isMarketClosed(market: string): boolean {
  return isWeekend() && (NON_CRYPTO_MARKETS as readonly string[]).includes(market as Market);
}
