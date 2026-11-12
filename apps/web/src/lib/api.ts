import type {
  TraderProfile,
  Attempt,
  Position,
  PayoutRequest,
  NextPayoutInfo,
  OverviewStats,
  LeaderboardEntry,
  AuthChallenge,
  AuthConnectResponse,
} from '@setl8/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Token storage helpers (localStorage, safe for SSR)
// ---------------------------------------------------------------------------

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('setl8_token');
}

function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('setl8_token', token);
}

function clearToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('setl8_token');
}

// ---------------------------------------------------------------------------
// API Error
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
// Base request
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers: extraHeaders = {} } = options;

  const headers: Record<string, string> = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...extraHeaders,
  };

  if (auth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    let errorCode: string | undefined;
    try {
      const errorData = (await response.json()) as { error?: string; code?: string; message?: string };
      errorMessage = errorData.error ?? errorData.message ?? errorMessage;
      errorCode = errorData.code;
    } catch {
      // ignore parse error
    }
    throw new ApiError(response.status, errorMessage, errorCode);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json()) as { success?: boolean; data?: T } | T;

  // Unwrap if wrapped in { success, data }
  if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
    return (data as { success: boolean; data: T }).data;
  }

  return data as T;
}

function get<T>(path: string, auth = true): Promise<T> {
  return request<T>(path, { method: 'GET', auth });
}

function post<T>(path: string, body?: unknown, auth = true): Promise<T> {
  return request<T>(path, { method: 'POST', body, auth });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function getNonce(walletAddress: string): Promise<AuthChallenge> {
  return post<AuthChallenge>('/api/auth/nonce', { walletAddress }, false);
}

export async function verifyWallet(
  walletAddress: string,
  signature: string,
  message: string,
): Promise<AuthConnectResponse> {
  const result = await post<AuthConnectResponse>(
    '/api/auth/verify',
    { walletAddress, signature, message },
    false,
  );
  setToken(result.token);
  return result;
}

export function logout(): void {
  clearToken();
}

// ---------------------------------------------------------------------------
// Trader
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<TraderProfile> {
  return get<TraderProfile>('/api/trader/profile');
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export async function getAttempts(): Promise<Attempt[]> {
  const result = await get<{ items: Attempt[]; total: number } | Attempt[]>('/api/attempts');
  // Backend returns paginated { items, total, ... } — unwrap to flat array
  if (result && typeof result === 'object' && 'items' in result) {
    return result.items;
  }
  return result as Attempt[];
}

// ---------------------------------------------------------------------------
// Attempt Chains (grouped view)
// ---------------------------------------------------------------------------

export interface ChainPhase {
  id: string;
  attemptNumber: number;
  phase: string;
  phaseLabel: string;
  status: string;
  startingBalance: number;
  currentBalance: number;
  pnlPercent: number;
  startedAt: string;
  endedAt: string | null;
  tradeCount: number;
  totalPayouts: number;
}

export interface AttemptChain {
  chainNumber: number;
  phases: ChainPhase[];
  isActive: boolean;
  totalPnl: number;
  totalPayouts: number;
  startedAt: string;
  endedAt: string | null;
  failedAtPhase: string | null;
}

export interface ChainsResponse {
  current: AttemptChain | null;
  past: AttemptChain[];
}

export async function getAttemptChains(): Promise<ChainsResponse> {
  return get<ChainsResponse>('/api/attempts/chains');
}

// ---------------------------------------------------------------------------
// Position History (per phase)
// ---------------------------------------------------------------------------

export interface PhaseTradeEntry {
  id: string;
  market: string;
  side: string;
  size: number;
  entryPrice: number;
  exitPrice: number | null;
  realizedPnl: number | null;
  openFee: number;
  closeFee: number | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
}

export async function getPhaseHistory(attemptId: string): Promise<{ trades: PhaseTradeEntry[] }> {
  return get<{ trades: PhaseTradeEntry[] }>(`/api/positions/history?attemptId=${attemptId}`);
}

export interface CreateAttemptInput {
  txSignature: string;
  accountSizeUsd: number;
  tokenSymbol: string;
}

export async function createAttempt(input: CreateAttemptInput): Promise<Attempt> {
  return post<Attempt>('/api/attempts', input);
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export async function getPositions(): Promise<Position[]> {
  return get<Position[]>('/api/positions');
}

export interface OpenPositionInput {
  market: string;
  side: string;
  sizeUsd: number;
  leverage: number;
}

export async function openPosition(input: OpenPositionInput): Promise<Position> {
  return post<Position>('/api/positions', input);
}

export async function closePosition(positionId: string): Promise<Position> {
  return post<Position>(`/api/positions/${positionId}/close`);
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export async function getPayouts(): Promise<PayoutRequest[]> {
  const result = await get<{ items: PayoutRequest[]; total: number }>('/api/payouts');
  // Backend returns paginated { items, total, ... } — unwrap to flat array
  if (result && typeof result === 'object' && 'items' in result) {
    return result.items;
  }
  return result as unknown as PayoutRequest[];
}

export async function getNextPayoutBatch(): Promise<NextPayoutInfo> {
  return get<NextPayoutInfo>('/api/payouts/next-batch');
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

export interface VaultBalance {
  usdc: number;
  usdt: number;
  usd1: number;
  totalUsd: number;
}

export async function getVaultBalance(): Promise<VaultBalance> {
  // Backend returns VaultTokenBalance[] — transform to flat object
  const raw = await get<Array<{ symbol: string; balanceUi: number }>>('/api/vault/balance', false);
  if (!Array.isArray(raw)) return raw as VaultBalance; // already transformed
  const result: VaultBalance = { usdc: 0, usdt: 0, usd1: 0, totalUsd: 0 };
  for (const entry of raw) {
    const key = entry.symbol.toLowerCase() as keyof Omit<VaultBalance, 'totalUsd'>;
    if (key in result) result[key] = entry.balanceUi;
    result.totalUsd += entry.balanceUi;
  }
  return result;
}

export interface VaultNextPayout {
  nextBatchAt: string;
  pendingRequestCount: number;
  pendingAmountUsd: number;
}

export async function getVaultNextPayout(): Promise<VaultNextPayout> {
  return get<VaultNextPayout>('/api/vault/next-payout', false);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getOverviewStats(): Promise<OverviewStats> {
  return get<OverviewStats>('/api/stats/overview', false);
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export interface EnhancedLeaderboardEntry {
  rank: number;
  traderId: string;
  walletAddress: string;
  totalPnlUsd: number;
  bestPnlPercent: number;
  winRate: number;
  totalTrades: number;
  bestTradeUsd: number;
  passedAttempts: number;
  totalPayoutsUsd: number;
  status: 'active' | 'funded' | 'completed';
}

export interface RecentPayout {
  id: string;
  walletAddress: string;
  amountUsd: number;
  tokenSymbol: string;
  txSignature: string;
  processedAt: string;
}

export interface LeaderboardStats {
  totalTraders: number;
  totalPayoutsUsd: number;
  totalVolumeUsd: number;
  totalVaultFires: number;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return get<LeaderboardEntry[]>('/api/leaderboard', false);
}

export async function getEnhancedLeaderboard(
  period: 'all' | 'month' | 'week' = 'all',
): Promise<EnhancedLeaderboardEntry[]> {
  try {
    return await get<EnhancedLeaderboardEntry[]>(`/api/leaderboard?period=${period}&limit=50`, false);
  } catch {
    // TODO: replace with real API call when backend endpoint exists
    return generateMockLeaderboard(period);
  }
}

export async function getRecentPayouts(limit = 20): Promise<RecentPayout[]> {
  try {
    return await get<RecentPayout[]>(`/api/payouts/recent?limit=${limit}`, false);
  } catch {
    // TODO: replace with real API call when backend endpoint exists
    return generateMockPayouts(limit);
  }
}

export async function getLeaderboardStats(): Promise<LeaderboardStats> {
  try {
    return await get<LeaderboardStats>('/api/leaderboard/stats', false);
  } catch {
    // TODO: replace with real API call when backend endpoint exists
    return {
      totalTraders: 347,
      totalPayoutsUsd: 89_420,
      totalVolumeUsd: 4_230_000,
      totalVaultFires: 12,
    };
  }
}

// ---------------------------------------------------------------------------
// Mock data generators (used when backend endpoints don't exist yet)
// ---------------------------------------------------------------------------

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function generateMockWallet(index: number): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let addr = '';
  for (let i = 0; i < 44; i++) {
    addr += chars[Math.floor(pseudoRandom(index * 100 + i) * chars.length)];
  }
  return addr;
}

function generateMockLeaderboard(period: 'all' | 'month' | 'week'): EnhancedLeaderboardEntry[] {
  const count = period === 'week' ? 15 : period === 'month' ? 22 : 30;
  const entries: EnhancedLeaderboardEntry[] = [];

  for (let i = 0; i < count; i++) {
    const seed = i + (period === 'month' ? 100 : period === 'week' ? 200 : 0);
    const winRate = 0.40 + pseudoRandom(seed * 3) * 0.30;
    const totalTrades = Math.floor(20 + pseudoRandom(seed * 5) * 180);
    const pnl = (8000 - i * 350) + pseudoRandom(seed * 7) * 500;
    const bestTrade = 200 + pseudoRandom(seed * 9) * 2800;
    const passed = Math.floor(pseudoRandom(seed * 11) * 6);
    const payouts = passed > 0 ? passed * (400 + pseudoRandom(seed * 13) * 1600) : 0;
    const statuses: Array<'active' | 'funded' | 'completed'> = ['active', 'funded', 'completed'];

    entries.push({
      rank: i + 1,
      traderId: `trader_${seed}`,
      walletAddress: generateMockWallet(seed),
      totalPnlUsd: Math.round(pnl * 100) / 100,
      bestPnlPercent: 3 + pseudoRandom(seed * 15) * 8,
      winRate: Math.round(winRate * 1000) / 1000,
      totalTrades,
      bestTradeUsd: Math.round(bestTrade * 100) / 100,
      passedAttempts: passed,
      totalPayoutsUsd: Math.round(payouts * 100) / 100,
      status: statuses[Math.floor(pseudoRandom(seed * 17) * 3)],
    });
  }

  return entries;
}

function generateMockPayouts(limit: number): RecentPayout[] {
  const tokens = ['USDC', 'USDT', 'USD1'];
  const payouts: RecentPayout[] = [];
  const now = Date.now();

  for (let i = 0; i < limit; i++) {
    const hoursAgo = i * 3 + pseudoRandom(i * 31) * 10;
    const amount = 200 + pseudoRandom(i * 37) * 2800;
    payouts.push({
      id: `payout_${i}`,
      walletAddress: generateMockWallet(i + 500),
      amountUsd: Math.round(amount * 100) / 100,
      tokenSymbol: tokens[Math.floor(pseudoRandom(i * 41) * 3)],
      txSignature: generateMockWallet(i + 1000),
      processedAt: new Date(now - hoursAgo * 60 * 60 * 1000).toISOString(),
    });
  }

  return payouts;
}

// ---------------------------------------------------------------------------
// P&L
// ---------------------------------------------------------------------------

export interface PnlData {
  attemptId: string;
  realizedPnl: number;
  unrealizedPnl: number;
  currentBalance: number;
  pnlPercent: number;
  drawdownPercent: number;
}

export async function getPnl(): Promise<PnlData> {
  return get<PnlData>('/api/trader/pnl');
}

// ---------------------------------------------------------------------------
// Telegram — link code
// ---------------------------------------------------------------------------

export interface TelegramLinkCode {
  code: string;
}

export async function getTelegramLinkCode(): Promise<TelegramLinkCode> {
  return post<TelegramLinkCode>('/api/telegram/link-code');
}

// ---------------------------------------------------------------------------
// Trades — full trade history for the active attempt
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
  return get<TradesResponse>('/api/trader/trades');
}

// ---------------------------------------------------------------------------
// Dev: Create Challenge (calls /api/dev/create-challenge)
// ---------------------------------------------------------------------------

export interface DevChallengeResult {
  attemptId: string;
  accountSize: number;
  status: string;
}

export async function createDevChallenge(
  walletAddress: string,
  accountSizeUsd: number,
  tokenSymbol: string,
): Promise<DevChallengeResult> {
  return post<DevChallengeResult>(
    '/api/dev/create-challenge',
    { walletAddress, accountSize: accountSizeUsd, tokenSymbol },
    true,
  );
}

// ---------------------------------------------------------------------------
// Export token helpers
// ---------------------------------------------------------------------------

export { getToken, setToken, clearToken };
