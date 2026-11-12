import { getToken, setToken } from './storage';
import type { TraderProfile, Attempt, Position, PayoutRequest } from '@setl8/types';

export interface PnlData {
  attemptId: string;
  realizedPnl: number;
  unrealizedPnl: number;
  currentBalance: number;
  startingBalance: number;
  pnlPercent: number;
  drawdownPercent: number;
}

export interface PayoutRequestInput {
  amountUsd: number;
  tokenSymbol: string;
}

export interface NextPayoutInfo {
  nextBatchAt: string;
  pendingCount: number;
  pendingAmountUsd: number;
}

export interface OverviewStats {
  totalTraders: number;
  activeTraders: number;
  totalPayoutsUsd: number;
  pendingPayoutsUsd: number;
  vaultBalance: number;
  passRate: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.145.35.81:3001';

/**
 * Coerce Prisma Decimal / stringified number fields to real numbers.
 * Walks the value recursively so nested objects and arrays are handled.
 */
function coerceDecimals<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(coerceDecimals) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Prisma Decimal fields arrive as strings that look like numbers
      if (typeof v === 'string' && v !== '' && !isNaN(Number(v)) && isFinite(Number(v)) && !/^[A-Za-z]/.test(v)) {
        // Only coerce fields that are commonly numeric
        const numericFields = [
          'accountSize', 'startingBalance', 'currentBalance', 'peakBalance',
          'profitTarget', 'maxDrawdownFloor', 'realizedPnl', 'unrealizedPnl',
          'totalPayoutTaken', 'entryPrice', 'exitPrice', 'size', 'leverage',
          'marginUsed', 'fundingPaid', 'amountUsd', 'totalPayoutsUsd',
          'balanceUsd', 'pnlPercent', 'drawdownPercent', 'passRate',
          'totalVolumeUsd', 'vaultBalance', 'pendingPayoutsUsd',
          'pendingAmountUsd', 'totalAmountUsd', 'bestPnlPercent',
          'priceCents',
        ];
        if (numericFields.includes(k)) {
          out[k] = Number(v);
        } else {
          out[k] = v;
        }
      } else {
        out[k] = coerceDecimals(v);
      }
    }
    return out as unknown as T;
  }
  return value;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let code: string | undefined;
    try {
      const body = await response.json() as { error?: string; code?: string };
      message = body.error ?? message;
      code = body.code;
    } catch { /* ignore */ }
    throw new ApiError(response.status, message, code);
  }

  const raw = await response.json() as { success?: boolean; data?: T } | T;
  let data: T;
  if (raw && typeof raw === 'object' && 'data' in raw && (raw as { data?: T }).data !== undefined) {
    data = (raw as { data: T }).data;
  } else {
    data = raw as T;
  }
  return coerceDecimals(data);
}

export async function getNonce(walletAddress: string): Promise<{ message: string; nonce: string }> {
  return request<{ message: string; nonce: string }>(`/api/auth/nonce?wallet=${encodeURIComponent(walletAddress)}`);
}

export async function verifyWallet(
  walletAddress: string,
  signature: string,
  message: string,
): Promise<{ token: string; trader: TraderProfile }> {
  const result = await request<{ token: string; trader: TraderProfile }>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, signature, message }),
  });
  await setToken(result.token);
  return result;
}

export async function getProfile(): Promise<TraderProfile> {
  return request<TraderProfile>('/api/trader/profile');
}

export async function getAttempts(): Promise<Attempt[]> {
  const data = await request<Attempt[]>('/api/attempts');
  return Array.isArray(data) ? data : [];
}

export async function getPositions(): Promise<Position[]> {
  const data = await request<Position[]>('/api/positions');
  return Array.isArray(data) ? data : [];
}

export async function openPosition(input: { market: string; side: string; sizeUsd: number }): Promise<Position> {
  return request<Position>('/api/positions', {
    method: 'POST',
    body: JSON.stringify({ ...input, leverage: 100 }),
  });
}

export async function closePosition(id: string): Promise<Position> {
  return request<Position>(`/api/positions/${id}/close`, { method: 'POST' });
}

export async function getPnl(): Promise<PnlData> {
  return request<PnlData>('/api/trader/pnl');
}

export async function getPayouts(): Promise<PayoutRequest[]> {
  const data = await request<PayoutRequest[]>('/api/trader/payout/history');
  return Array.isArray(data) ? data : [];
}

export async function getNextPayoutBatch(): Promise<NextPayoutInfo> {
  return request<NextPayoutInfo>('/api/trader/payout/next-batch');
}

export async function requestPayout(input: PayoutRequestInput): Promise<PayoutRequest> {
  return request<PayoutRequest>('/api/trader/payout/request', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getOverviewStats(): Promise<OverviewStats> {
  return request<OverviewStats>('/api/stats/overview');
}

export async function getVaultBalance(): Promise<{ balanceUsd: number }> {
  return request<{ balanceUsd: number }>('/vault/balance');
}
