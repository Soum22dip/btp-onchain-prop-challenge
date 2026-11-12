import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes without conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a USD dollar amount with commas and 2 decimal places.
 * e.g. 1234.5 → "$1,234.50"
 */
export function formatUsd(amount: number | string | null | undefined, decimals = 2): string {
  const n = Number(amount);
  if (!isFinite(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

/**
 * Format a number with commas, no currency symbol.
 * e.g. 1234567 → "1,234,567"
 */
export function formatNumber(value: number | string | null | undefined, decimals = 0): string {
  const n = Number(value);
  if (!isFinite(n)) return '0';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

/**
 * Format a percentage value.
 * e.g. 0.08 → "+8.00%" or -0.035 → "-3.50%"
 */
export function formatPercent(value: number | null | undefined, decimals = 2, showSign = true): string {
  const n = Number(value);
  if (!isFinite(n)) return '0.00%';
  const sign = showSign && n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(decimals)}%`;
}

/**
 * Truncate a Solana wallet address for display.
 * e.g. "5tkYmB8SwQ6XfvSZ1jawyN5VHQuaAfMpV61fVyuTgukx" → "5tkY...gukx"
 */
export function truncateAddress(address: string | null | undefined, chars = 4): string {
  if (!address) return '—';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Format a date to a readable string.
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a datetime to a readable string.
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get countdown string from now to a future date.
 * e.g. "5d 12h 30m"
 */
export function formatCountdown(targetDate: Date | string | null | undefined): string {
  if (!targetDate) return '—';
  const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  if (isNaN(target.getTime())) return '—';
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) return '0m';

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get a Solscan URL for a transaction on devnet.
 */
export function getSolscanTxUrl(signature: string, network: 'devnet' | 'mainnet-beta' = 'devnet'): string {
  const cluster = network === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/tx/${signature}${cluster}`;
}

/**
 * Get a Solscan URL for an account on devnet.
 */
export function getSolscanAccountUrl(address: string, network: 'devnet' | 'mainnet-beta' = 'devnet'): string {
  const cluster = network === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/account/${address}${cluster}`;
}

/**
 * Returns true if the attempt number is payout-eligible (3-7).
 */
export function isPayoutEligible(attemptNumber: number): boolean {
  return attemptNumber >= 3 && attemptNumber <= 7;
}

/**
 * Returns "Evaluation" or "Funded" label based on attempt number.
 */
export function getAttemptPhaseName(attemptNumber: number): string {
  return attemptNumber <= 2 ? 'Evaluation' : 'Funded';
}
