import type {
  AdminStats,
  AdminTradersResponse,
  AdminPayoutQueueResponse,
  FraudFlaggedResponse,
  VaultTokenBalance,
  OverviewStats,
  ChallengeSalesResponse,
  MarketMonitorData,
  VaultHealthData,
  TraderDetail,
} from './types';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const ADMIN_SECRET_KEY = 'setl8_admin_secret';

// ---------------------------------------------------------------------------
// Storage helpers (SSR-safe)
// ---------------------------------------------------------------------------

export function getAdminSecret(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(ADMIN_SECRET_KEY) ?? '';
}

export function setAdminSecret(secret: string): void {
  if (typeof window === 'undefined') return;
  if (secret) {
    window.localStorage.setItem(ADMIN_SECRET_KEY, secret);
  } else {
    window.localStorage.removeItem(ADMIN_SECRET_KEY);
  }
}

export function clearAdminSecret(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ADMIN_SECRET_KEY);
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Base request
// ---------------------------------------------------------------------------

interface WrappedResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  requireAuth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (requireAuth) {
    const secret = getAdminSecret();
    if (secret) {
      headers['X-Admin-Secret'] = secret;
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 || res.status === 403) {
    throw new ApiError(res.status, 'Unauthorized');
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      // ignore parse error
    }
    throw new ApiError(res.status, message);
  }

  // Handle both wrapped { success: true, data: T } and plain T responses
  const text = await res.text();
  if (!text) return undefined as unknown as T;

  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(500, 'Invalid JSON response');
  }

  const wrapped = json as WrappedResponse<T>;
  if (
    wrapped !== null &&
    typeof wrapped === 'object' &&
    'success' in wrapped &&
    'data' in wrapped
  ) {
    if (!wrapped.success) {
      throw new ApiError(400, wrapped.error ?? 'API error');
    }
    return wrapped.data as T;
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Exported API functions
// ---------------------------------------------------------------------------

export async function getAdminStats(): Promise<AdminStats> {
  type StatsOverview = {
    totalTraders: number;
    activeTraders: number;
    totalVolumeUsd: number;
    totalPayoutsUsd: number;
    vaultBalance: number;
    passRate: number;
  };

  const [overview, payoutQueue] = await Promise.all([
    request<StatsOverview>('/api/stats/overview', {}, false),
    request<AdminPayoutQueueResponse>('/api/admin/payout/queue', {}, true).catch(
      () => null,
    ),
  ]);

  return {
    totalTraders: overview.totalTraders,
    activeTraders: overview.activeTraders,
    totalVolumeUsd: overview.totalVolumeUsd,
    totalPayoutsUsd: overview.totalPayoutsUsd,
    vaultBalance: overview.vaultBalance,
    passRate: overview.passRate,
    pendingPayoutsUsd: payoutQueue?.totalPendingUsd ?? 0,
    pendingPayoutCount: payoutQueue?.total ?? 0,
  };
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const [overview, vaultBalances] = await Promise.all([
    request<OverviewStats>('/api/admin/overview'),
    getVaultBalance().catch(() => []),
  ]);

  // Merge on-chain vault balance (fetched from public endpoint)
  const vaultBalance = vaultBalances.reduce((sum, b) => sum + b.balanceUi, 0);

  return {
    ...overview,
    vaultBalance,
  };
}

export async function getAdminTraders(): Promise<AdminTradersResponse> {
  return request<AdminTradersResponse>('/api/admin/traders');
}

export async function getTraderDetail(traderId: string): Promise<TraderDetail> {
  return request<TraderDetail>(`/api/admin/traders/${traderId}`);
}

export async function banTrader(
  traderId: string,
  reason: string,
  action: 'BAN' | 'SUSPEND' | 'UNBAN' = 'BAN',
): Promise<void> {
  await request<void>('/api/admin/trader/ban', {
    method: 'POST',
    body: JSON.stringify({ traderId, action, reason }),
  });
}

export async function getPayoutQueue(): Promise<AdminPayoutQueueResponse> {
  return request<AdminPayoutQueueResponse>('/api/admin/payout/queue');
}

export async function processPayouts(): Promise<{ message: string }> {
  return request<{ message: string }>('/api/admin/payout/process', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getFraudFlags(): Promise<FraudFlaggedResponse> {
  return request<FraudFlaggedResponse>('/api/admin/fraud/flagged');
}

export async function getVaultBalance(): Promise<VaultTokenBalance[]> {
  return request<VaultTokenBalance[]>('/api/vault/balance', {}, false);
}

export async function getVaultHealth(): Promise<VaultHealthData> {
  const [health, balances] = await Promise.all([
    request<Omit<VaultHealthData, 'tokenBalances'>>('/api/admin/vault/health'),
    getVaultBalance().catch(() => []),
  ]);

  // Use on-chain balance if available, otherwise use estimated
  const onChainBalance = balances.reduce((sum, b) => sum + b.balanceUi, 0);

  return {
    ...health,
    currentBalance: onChainBalance > 0 ? onChainBalance : health.currentBalance,
    tokenBalances: balances,
  };
}

export async function getChallengeSales(): Promise<ChallengeSalesResponse> {
  return request<ChallengeSalesResponse>('/api/admin/sales');
}

export async function getMarketMonitor(): Promise<MarketMonitorData> {
  return request<MarketMonitorData>('/api/admin/market/status');
}
