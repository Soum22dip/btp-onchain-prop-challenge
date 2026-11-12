// Types not present in @setl8/types — admin-specific API response shapes

export interface AdminTrader {
  id: string;
  walletAddress: string;
  status: string;
  fraudFlags: string[];
  createdAt: string;
  updatedAt: string;
  totalAttempts: number;
  activeAttemptId: string | null;
  totalPayoutsUsd: number;
  // Extended fields for detail view
  currentPnl?: number;
  accountSize?: number;
  currentAttemptNumber?: number;
}

export interface AdminTradersResponse {
  items: AdminTrader[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AdminPayoutQueueItem {
  id: string;
  traderId: string;
  amountUsd: number | string; // Decimal from Prisma
  tokenSymbol: string;
  requestedAt: string;
  status: string;
  attemptId: string;
  trader: { walletAddress: string };
  attempt: { attemptNumber: number; accountSize: number | string };
  processedAt?: string;
  txHash?: string;
  vaultFireCycle?: number;
}

export interface AdminPayoutQueueResponse {
  items: AdminPayoutQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalPendingUsd: number;
}

export interface FraudFlagRecord {
  flag: string;
  notes: string | null;
  flaggedAt: string;
  flaggedBy: string | null;
}

export interface FraudFlaggedTrader {
  id: string;
  walletAddress: string;
  status: string;
  fraudFlags: string[];
  updatedAt: string;
  fraudFlagRecords: FraudFlagRecord[];
}

export interface FraudFlaggedResponse {
  items: FraudFlaggedTrader[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface VaultTokenBalance {
  symbol: string;
  mint: string;
  balanceRaw: string;
  balanceUi: number;
  decimals: number;
}

export interface AdminStats {
  totalTraders: number;
  activeTraders: number;
  totalVolumeUsd: number;
  totalPayoutsUsd: number;
  vaultBalance: number;
  passRate: number;
  pendingPayoutsUsd: number;
  pendingPayoutCount: number;
}

// ---------------------------------------------------------------------------
// Challenge Sales types
// ---------------------------------------------------------------------------

export interface ChallengeSale {
  id: string;
  traderId: string;
  walletAddress: string;
  accountSize: number;
  priceUsd: number;
  tokenSymbol: string;
  txHash: string;
  purchasedAt: string;
}

export interface ChallengeSalesResponse {
  items: ChallengeSale[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalRevenueUsd: number;
  revenueByTier: Record<string, { count: number; revenue: number }>;
}

// ---------------------------------------------------------------------------
// Overview extended types
// ---------------------------------------------------------------------------

export interface OverviewStats extends AdminStats {
  challengesSold: number;
  challengeRevenue: number;
  activeFundedAccounts: number;
  nextVaultFireAt: string | null;
  revenueToday: number;
  revenueThisWeek: number;
  revenueThisMonth: number;
  passRatePhase1: number | null;
  passRatePhase2: number | null;
  passRateFunded: number | null;
}

// ---------------------------------------------------------------------------
// Market Monitor types
// ---------------------------------------------------------------------------

export interface MarketFeedStatus {
  symbol: string;
  category: string;
  lastPrice: number;
  lastUpdated: string;
  source: string;
  isStale: boolean;
  staleSinceMs: number;
}

export interface MarketMonitorData {
  feeds: MarketFeedStatus[];
  bybitConnected: boolean;
  finnhubConnected: boolean;
  totalMarkets: number;
  staleCount: number;
  categoryCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Vault Health types
// ---------------------------------------------------------------------------

export interface VaultHealthData {
  currentBalance: number;
  totalInflow: number;
  totalOutflow: number;
  netChange: number;
  coverageRatio: number;
  expectedPayouts: number;
  tokenBalances: VaultTokenBalance[];
}

// ---------------------------------------------------------------------------
// Trader detail types
// ---------------------------------------------------------------------------

export interface TraderAttempt {
  id: string;
  attemptNumber: number;
  accountSize: number;
  status: string;
  pnlUsd: number;
  pnlPercent: number;
  startedAt: string;
  endedAt: string | null;
  positionsCount: number;
}

export interface TraderDetail extends AdminTrader {
  attempts: TraderAttempt[];
  payoutHistory: AdminPayoutQueueItem[];
}
