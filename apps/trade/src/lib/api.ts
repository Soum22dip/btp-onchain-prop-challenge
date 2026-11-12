import type { TraderProfile, Attempt, Position } from '@setl8/types';
import type { CandleData } from '@/store/market';
import type { UTCTimestamp } from 'lightweight-charts';

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'setl8_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Base request function
// ---------------------------------------------------------------------------

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      message = body.error ?? message;
      code = body.code;
    } catch {
      // ignore parse error
    }
    throw new ApiError(response.status, message, code);
  }

  const body = (await response.json()) as { success?: boolean; data?: T } | T;

  // Backend wraps all responses in { success: true, data: <payload> }
  // Unwrap transparently so callers get the payload directly.
  if (
    body !== null &&
    typeof body === 'object' &&
    'success' in body &&
    'data' in body
  ) {
    return body.data as T;
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

export async function getNonce(
  walletAddress: string,
): Promise<{ message: string; nonce: string }> {
  return request<{ message: string; nonce: string }>(
    '/api/auth/nonce',
    {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    },
  );
}

export async function verifyWallet(
  walletAddress: string,
  signature: string,
  message: string,
): Promise<{ token: string; trader: TraderProfile }> {
  const result = await request<{ token: string; trader: TraderProfile }>(
    '/api/auth/verify',
    {
      method: 'POST',
      body: JSON.stringify({ walletAddress, signature, message }),
    },
  );
  setToken(result.token);
  return result;
}

// ---------------------------------------------------------------------------
// Trader endpoints
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<TraderProfile> {
  return request<TraderProfile>('/api/trader/profile');
}

export async function getAttempts(): Promise<Attempt[]> {
  return request<Attempt[]>('/api/attempts');
}

export async function getPositions(): Promise<Position[]> {
  return request<Position[]>('/api/positions');
}

export async function openPosition(input: {
  market: string;
  side: string;
  sizeUsd?: number;
  assetQuantity?: number;
  stopLoss?: number;
  takeProfit?: number;
  orderType?: 'MARKET' | 'LIMIT';
  limitPrice?: number;
}): Promise<Position> {
  return request<Position>('/api/positions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function closePosition(id: string): Promise<Position> {
  return request<Position>(`/api/positions/${id}/close`, {
    method: 'POST',
  });
}

export async function partialClosePosition(id: string, percent: number): Promise<Position> {
  return request<Position>(`/api/positions/${id}/partial-close`, {
    method: 'POST',
    body: JSON.stringify({ percent }),
  });
}

export async function cancelLimitOrder(id: string): Promise<unknown> {
  return request(`/api/positions/${id}/cancel`, {
    method: 'POST',
  });
}

export async function closeAllPositions(): Promise<{ closed: number; total: number }> {
  return request<{ closed: number; total: number }>('/api/positions/close-all', { method: 'POST' });
}

export async function cancelAllOrders(): Promise<{ cancelled: number; total: number }> {
  return request<{ cancelled: number; total: number }>('/api/positions/cancel-all', { method: 'POST' });
}

export async function updateSlTp(
  id: string,
  stopLoss?: number | null,
  takeProfit?: number | null,
): Promise<Position> {
  return request<Position>(`/api/positions/${id}/sl-tp`, {
    method: 'PATCH',
    body: JSON.stringify({ stopLoss, takeProfit }),
  });
}

export async function getPnl(): Promise<{
  attemptId: string;
  realizedPnl: number;
  unrealizedPnl: number;
  currentBalance: number;
  pnlPercent: number;
  drawdownPercent: number;
}> {
  return request('/api/trader/pnl');
}

export interface ChallengeData {
  attemptId: string;
  phase: string;
  attemptNumber: number;
  status: string;
  accountSize: number;
  startingBalance: number;
  currentBalance: number;
  peakBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPayoutTaken: number;
  equity: number;
  pnlPercent: number;
  drawdownPercent: number;
  profitTarget: number;
  maxDrawdownFloor: number;
  targetPrice: number;
  drawdownPrice: number;
  openPositions: number;
  marginInUse: number;
  availableBalance: number;
  startedAt: string;
}

export async function getChallenge(): Promise<ChallengeData | null> {
  return request<ChallengeData | null>('/api/trader/challenge');
}

export async function getCandles(market: string): Promise<CandleData[]> {
  type RawCandle = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  };

  const raw = await request<RawCandle[]>(
    `/api/markets/${encodeURIComponent(market)}/candles`,
  );

  return raw.map((c) => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}
// ---------------------------------------------------------------------------
// Trades (history)
// ---------------------------------------------------------------------------

export interface TradeEntry {
  id: string;
  market: string;
  side: string;
  status: string;
  orderType: string;
  orderStatus: string;
  size: number;
  remainingSize: number;
  marginUsed: number;
  entryPrice: number;
  exitPrice: number | null;
  leverage: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openFee: number;
  closeFee: number;
  stopLoss: number | null;
  takeProfit: number | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  assetQuantity: number;
}

export interface TradeSummary {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  bestTrade: number;
  worstTrade: number;
  totalFees: number;
}

export interface TradesResponse {
  attempt: {
    id: string;
    currentBalance: number;
    startingBalance: number;
    maxDrawdownFloor: number;
    peakBalance: number;
    status: string;
    drawdownRemaining: number;
  };
  trades: TradeEntry[];
  summary: TradeSummary;
}

export async function getTrades(): Promise<TradesResponse> {
  return request<TradesResponse>('/api/trader/trades');
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export function logout(): void {
  clearToken();
}