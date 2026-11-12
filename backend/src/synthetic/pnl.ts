// =============================================================================
// Setl8 Backend — P&L Calculations
//
// Pure functions — no side effects, no DB access.
// All monetary values are plain numbers representing USD with up to 6 decimal
// places.  Callers must store results via Prisma's Decimal fields.
//
// Position sizing model (USD notional):
//   size      = USD notional value of the position
//   entryPrice = asset price at open
//   leverage   = size / marginUsed
//
// P&L formula (identical for realised and unrealised):
//   LONG  pnl = (currentPrice - entryPrice) / entryPrice * size
//   SHORT pnl = (entryPrice - currentPrice) / entryPrice * size
// =============================================================================

import { PositionSide } from '@setl8/types';

// ---------------------------------------------------------------------------
// Local types — mirror the relevant Prisma fields without importing Prisma
// ---------------------------------------------------------------------------

interface PositionLike {
  side: PositionSide;
  entryPrice: number | { toNumber(): number };
  size: number | { toNumber(): number };
}

interface AttemptLike {
  startingBalance: number | { toNumber(): number };
  peakBalance: number | { toNumber(): number };
  maxDrawdownFloor: number | { toNumber(): number };
  profitTarget: number | { toNumber(): number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Coerce a Prisma Decimal or plain number to a JS number. */
function n(v: number | { toNumber(): number }): number {
  return typeof v === 'number' ? v : v.toNumber();
}

/** Round to 6 decimal places (USD precision). */
function round6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------------
// calculateUnrealizedPnl
// ---------------------------------------------------------------------------

/**
 * Returns the unrealised P&L in USD for an open position given the current
 * market price.
 *
 * Positive = profit, negative = loss.
 */
export function calculateUnrealizedPnl(
  position: PositionLike,
  currentPrice: number,
): number {
  const entry = n(position.entryPrice);
  const size = n(position.size);

  if (entry <= 0 || currentPrice <= 0) return 0;

  const priceDelta =
    position.side === PositionSide.Long
      ? currentPrice - entry
      : entry - currentPrice;

  return round6((priceDelta / entry) * size);
}

// ---------------------------------------------------------------------------
// calculateRealizedPnl
// ---------------------------------------------------------------------------

/**
 * Returns the realised P&L in USD when a position is closed at `exitPrice`.
 * Funding costs should be subtracted by the caller before recording.
 */
export function calculateRealizedPnl(
  position: PositionLike,
  exitPrice: number,
): number {
  return calculateUnrealizedPnl(position, exitPrice);
}

// ---------------------------------------------------------------------------
// calculateFunding
// ---------------------------------------------------------------------------

/**
 * Returns the incremental funding cost for one 8-hour period.
 *
 * Funding is always a cost (deducted from the trader's P&L):
 *   fundingCost = size * fundingRate
 *
 * `fundingRate` is a non-negative decimal fraction per 8-hour period
 * (e.g. 0.0001 = 0.01 % per 8 h).
 */
export function calculateFunding(
  position: { size: number | { toNumber(): number } },
  fundingRate: number,
): number {
  return round6(n(position.size) * Math.abs(fundingRate));
}

// ---------------------------------------------------------------------------
// checkDrawdown
// ---------------------------------------------------------------------------

export interface DrawdownResult {
  /** Drawdown from peak balance as a percentage (0–100). */
  drawdownPct: number;
  /** True when currentBalance ≤ maxDrawdownFloor — attempt must be failed. */
  breached: boolean;
}

/**
 * Checks whether the trader has breached the maximum drawdown limit.
 *
 * `drawdownPct` is always non-negative.
 * `breached` is true if currentBalance has hit or gone below the drawdown floor.
 */
export function checkDrawdown(
  attempt: AttemptLike,
  currentBalance: number,
): DrawdownResult {
  const peak = n(attempt.peakBalance);
  const floor = n(attempt.maxDrawdownFloor);

  const drawdownPct =
    peak > 0 ? round6(((peak - currentBalance) / peak) * 100) : 0;

  return {
    drawdownPct: Math.max(0, drawdownPct),
    breached: currentBalance <= floor,
  };
}

// ---------------------------------------------------------------------------
// checkProfitTarget
// ---------------------------------------------------------------------------

/**
 * Returns true when the trader has reached (or exceeded) the profit target
 * for this attempt.
 */
export function checkProfitTarget(
  attempt: AttemptLike,
  currentBalance: number,
): boolean {
  return currentBalance >= n(attempt.profitTarget);
}
