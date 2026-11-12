// =============================================================================
// SETL8 — Shared TypeScript Types
// =============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum TokenSymbol {
  USDC = 'USDC',
  USDT = 'USDT',
  USD1 = 'USD1',
}

export enum Network {
  Devnet = 'devnet',
  Mainnet = 'mainnet-beta',
}

export enum AttemptStatus {
  Active = 'ACTIVE',
  Passed = 'PASSED',
  Failed = 'FAILED',
  Abandoned = 'ABANDONED',
}

export enum AttemptPhase {
  Evaluation = 'EVALUATION', // attempts 1–2, no payout
  Funded = 'FUNDED',         // attempts 3–7, payout eligible
}

export enum PositionSide {
  Long = 'LONG',
  Short = 'SHORT',
}

export enum PositionStatus {
  Open = 'OPEN',
  Closed = 'CLOSED',
  Liquidated = 'LIQUIDATED',
}

// ---------------------------------------------------------------------------
// Market — 113 tradeable instruments
// ---------------------------------------------------------------------------

export enum Market {
  // -------------------------------------------------------------------------
  // Crypto (66) — Binance real-time via WebSocket
  // -------------------------------------------------------------------------
  BTC    = 'BTC',
  ETH    = 'ETH',
  SOL    = 'SOL',
  BNB    = 'BNB',
  XRP    = 'XRP',
  DOGE   = 'DOGE',
  ADA    = 'ADA',
  AVAX   = 'AVAX',
  LINK   = 'LINK',
  DOT    = 'DOT',
  LTC    = 'LTC',
  BCH    = 'BCH',
  UNI    = 'UNI',
  ATOM   = 'ATOM',
  ETC    = 'ETC',
  APT    = 'APT',
  OP     = 'OP',
  ARB    = 'ARB',
  MATIC  = 'MATIC',
  SUI    = 'SUI',
  SEI    = 'SEI',
  TIA    = 'TIA',
  INJ    = 'INJ',
  FTM    = 'FTM',
  NEAR   = 'NEAR',
  PEPE   = 'PEPE',
  WIF    = 'WIF',
  JUP    = 'JUP',
  BONK   = 'BONK',
  RAY    = 'RAY',
  RENDER = 'RENDER',
  FET    = 'FET',
  GRT    = 'GRT',
  SNX    = 'SNX',
  AAVE   = 'AAVE',
  MKR    = 'MKR',
  COMP   = 'COMP',
  LDO    = 'LDO',
  STX    = 'STX',
  RUNE   = 'RUNE',
  WLD    = 'WLD',
  TAO    = 'TAO',
  JTO    = 'JTO',
  PYTH   = 'PYTH',
  ONDO   = 'ONDO',
  ENA    = 'ENA',
  EIGEN  = 'EIGEN',
  NOT    = 'NOT',
  TURBO  = 'TURBO',
  TRX    = 'TRX',
  HYPE   = 'HYPE',
  HBAR   = 'HBAR',
  ZEC    = 'ZEC',
  SHIB   = 'SHIB',
  TON    = 'TON',
  CRO    = 'CRO',
  MNT    = 'MNT',
  ICP    = 'ICP',
  POL    = 'POL',
  KAS    = 'KAS',
  QNT    = 'QNT',
  ALGO   = 'ALGO',
  TRUMP  = 'TRUMP',
  FIL    = 'FIL',
  ZRO    = 'ZRO',
  VET    = 'VET',
  // -------------------------------------------------------------------------
  // Metals (2) — Metals.live REST polling
  // -------------------------------------------------------------------------
  XAU = 'XAU',
  XAG = 'XAG',
  // -------------------------------------------------------------------------
  // Indices (4) — Finnhub real-time via WebSocket
  // -------------------------------------------------------------------------
  SPY = 'SPY',
  QQQ = 'QQQ',
  DIA = 'DIA',
  IWM = 'IWM',
  // -------------------------------------------------------------------------
  // Forex (14) — Finnhub real-time via WebSocket
  // -------------------------------------------------------------------------
  EUR_USD = 'EUR_USD',
  GBP_USD = 'GBP_USD',
  USD_JPY = 'USD_JPY',
  AUD_USD = 'AUD_USD',
  USD_CAD = 'USD_CAD',
  USD_CHF = 'USD_CHF',
  NZD_USD = 'NZD_USD',
  EUR_GBP = 'EUR_GBP',
  EUR_JPY = 'EUR_JPY',
  GBP_JPY = 'GBP_JPY',
  EUR_CHF = 'EUR_CHF',
  AUD_JPY = 'AUD_JPY',
  USD_MXN = 'USD_MXN',
  USD_SGD = 'USD_SGD',
}

export enum PayoutStatus {
  Pending = 'PENDING',
  Approved = 'APPROVED',
  Processing = 'PROCESSING',
  Completed = 'COMPLETED',
  Rejected = 'REJECTED',
}

export enum TraderStatus {
  Active = 'ACTIVE',
  Banned = 'BANNED',
  Suspended = 'SUSPENDED',
}

export enum FraudFlag {
  UnusualPnL = 'UNUSUAL_PNL',
  RapidOpenClose = 'RAPID_OPEN_CLOSE',
  SuspiciousPattern = 'SUSPICIOUS_PATTERN',
  MultipleAccounts = 'MULTIPLE_ACCOUNTS',
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export interface TokenInfo {
  symbol: TokenSymbol;
  decimals: number;
  devnetMint: string;
  mainnetMint: string;
}

// ---------------------------------------------------------------------------
// Evaluation Package
// ---------------------------------------------------------------------------

export interface EvaluationPackage {
  priceCents: number;   // fee in USD cents (e.g. 2500 = $25.00)
  accountSize: number;  // synthetic account size in USD
}

// ---------------------------------------------------------------------------
// Trader
// ---------------------------------------------------------------------------

export interface Trader {
  id: string;
  walletAddress: string;
  status: TraderStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TraderProfile extends Trader {
  totalAttempts: number;
  activeAttemptId: string | null;
  totalPayoutsUsd: number;
  fraudFlags: FraudFlag[];
}

// ---------------------------------------------------------------------------
// Attempt
// ---------------------------------------------------------------------------

export interface Attempt {
  id: string;
  traderId: string;
  attemptNumber: number;       // 1–7
  phase: AttemptPhase;
  status: AttemptStatus;
  accountSize: number;         // USD
  startingBalance: number;     // USD
  currentBalance: number;      // USD
  peakBalance: number;         // USD (for drawdown tracking)
  profitTarget: number;        // USD (startingBalance * 1.08)
  maxDrawdownFloor: number;    // USD (startingBalance * 0.92)
  realizedPnl: number;         // USD
  unrealizedPnl: number;       // USD
  totalPayoutTaken: number;    // USD (cumulative across this attempt)
  tokenUsed: TokenSymbol;
  txSignature: string;         // deposit tx on Solana
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
}

export interface AttemptSnapshot {
  id: string;
  attemptId: string;
  balance: number;
  pnlPercent: number;
  drawdownPercent: number;
  snapshotAt: Date;             // every 8 hours SGT (UTC+8)
}

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

export interface Position {
  id: string;
  attemptId: string;
  traderId: string;
  market: Market;
  side: PositionSide;
  status: PositionStatus;
  entryPrice: number;
  exitPrice: number | null;
  size: number;                // USD notional
  leverage: number;
  marginUsed: number;          // USD
  realizedPnl: number | null;  // USD, set on close
  unrealizedPnl: number;       // USD, live
  fundingPaid: number;         // USD
  openedAt: Date;
  closedAt: Date | null;
}

export interface PositionOpenInput {
  market: Market;
  side: PositionSide;
  size: number;       // USD notional
  leverage: number;
}

export interface PositionCloseInput {
  positionId: string;
}

// ---------------------------------------------------------------------------
// Price Feed
// ---------------------------------------------------------------------------

export interface PriceFeed {
  market: Market;
  price: number;
  confidence: number;
  publishTime: number;         // unix timestamp
}

export type PriceFeedMap = Record<Market, PriceFeed>;

// ---------------------------------------------------------------------------
// Payout
// ---------------------------------------------------------------------------

export interface PayoutRequest {
  id: string;
  traderId: string;
  attemptId: string;
  walletAddress: string;
  amountUsd: number;
  tokenSymbol: TokenSymbol;
  status: PayoutStatus;
  batchId: string | null;
  onchainTxSignature: string | null;
  requestedAt: Date;
  processedAt: Date | null;
}

export interface PayoutBatch {
  id: string;
  scheduledAt: Date;
  processedAt: Date | null;
  totalRequests: number;
  totalAmountUsd: number;
  adminTxSignature: string | null;
  successful: number;
  failed: number;
}

export interface NextPayoutInfo {
  nextBatchAt: Date;
  hoursUntilBatch: number;
  pendingRequestCount: number;
  pendingAmountUsd: number;
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

export interface VaultStats {
  vaultBalance: number;        // SOL or USDT equiv in payout vault
  totalDeposited: number;      // cumulative USD
  totalPaidOut: number;        // cumulative USD
  nextPayoutBatchAt: Date;
  activeTradersCount: number;
}

export interface VaultState {
  admin: string;               // protocol wallet pubkey
  protocolWallet: string;
  payoutVault: string;
  supportedMints: string[];
  totalDeposited: bigint;      // lamports / token smallest unit
  totalPaidOut: bigint;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthChallenge {
  nonce: string;
  message: string;
  expiresAt: number;           // unix timestamp
}

export interface AuthConnectInput {
  walletAddress: string;
  signature: string;
  message: string;
}

export interface AuthTokenPayload {
  sub: string;                 // traderId
  wallet: string;
  iat: number;
  exp: number;
}

export interface AuthConnectResponse {
  token: string;
  trader: TraderProfile;
}

// ---------------------------------------------------------------------------
// API — Generic
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// API — Request / Response shapes (typed DTOs)
// ---------------------------------------------------------------------------

export interface OpenPositionRequest {
  market: Market;
  side: PositionSide;
  sizeUsd: number;
  leverage: number;
}

export interface ClosePositionRequest {
  positionId: string;
}

export interface PayoutRequestInput {
  amountUsd: number;
  tokenSymbol: TokenSymbol;
}

export interface AdminProcessPayoutInput {
  batchId?: string;            // if omitted, process all pending
}

export interface AdminBanTraderInput {
  traderId: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  rank: number;
  traderId: string;
  walletAddress: string;       // truncated for display
  bestPnlPercent: number;
  totalPayoutsUsd: number;
  passedAttempts: number;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface OverviewStats {
  totalTraders: number;
  activeTraders: number;
  totalVolumeUsd: number;
  totalPayoutsUsd: number;
  vaultBalance: number;
  passRate: number;            // 0–1
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminTraderRow extends TraderProfile {
  attempts: Attempt[];
  payouts: PayoutRequest[];
  lastActiveAt: Date | null;
}

export interface FlaggedTrader {
  traderId: string;
  walletAddress: string;
  flags: FraudFlag[];
  flaggedAt: Date;
  notes: string;
}

// ---------------------------------------------------------------------------
// Solana on-chain
// ---------------------------------------------------------------------------

export interface DepositEvaluationFeeAccounts {
  vaultState: string;
  trader: string;
  traderTokenAccount: string;
  protocolTokenAccount: string;
  payoutVaultTokenAccount: string;
  tokenMint: string;
  tokenProgram: string;
  systemProgram: string;
}

export interface OnchainPayoutRequest {
  traderPubkey: string;
  amountLamports: bigint;
  timestamp: number;
  status: PayoutStatus;
  evaluationId: string;
}

// ---------------------------------------------------------------------------
// WebSocket events
// ---------------------------------------------------------------------------

export enum WsEvent {
  PriceUpdate = 'price:update',
  PnlUpdate = 'pnl:update',
  PositionClosed = 'position:closed',
  AttemptFailed = 'attempt:failed',
  AttemptPassed = 'attempt:passed',
  PayoutProcessed = 'payout:processed',
}

export interface WsPriceUpdate {
  event: WsEvent.PriceUpdate;
  data: Partial<PriceFeedMap>;
}

export interface WsPnlUpdate {
  event: WsEvent.PnlUpdate;
  data: {
    attemptId: string;
    realizedPnl: number;
    unrealizedPnl: number;
    currentBalance: number;
    pnlPercent: number;
    drawdownPercent: number;
  };
}

export interface WsPositionClosed {
  event: WsEvent.PositionClosed;
  data: {
    positionId: string;
    realizedPnl: number;
    exitPrice: number;
  };
}

export interface WsAttemptResult {
  event: WsEvent.AttemptFailed | WsEvent.AttemptPassed;
  data: {
    attemptId: string;
    attemptNumber: number;
    finalPnlPercent: number;
    reason: string;
  };
}

export type WsMessage =
  | WsPriceUpdate
  | WsPnlUpdate
  | WsPositionClosed
  | WsAttemptResult;
