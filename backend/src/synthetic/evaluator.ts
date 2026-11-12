// =============================================================================
// Setl8 Backend — EvaluatorService
//
// Evaluates all active attempts on every tick:
//   1. Recalculate unrealised P&L for each open position
//   2. Update attempt.currentBalance
//   3. Update attempt.peakBalance
//   4. Check drawdown — fail attempt + force-close all positions if breached
//   5. Check profit target — mark attempt PASSED if reached
//   6. Emit WebSocket P&L update to the connected trader
// =============================================================================

import { AttemptPhase, AttemptStatus, Market, PositionSide, PositionStatus, WsEvent } from '@setl8/types';
import { prisma } from '../lib/prisma.js';
import { emitToTrader } from '../lib/ws-registry.js';

// Prisma transaction client type (excludes lifecycle methods)
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
import { marketService } from './market.js';
import {
  calculateUnrealizedPnl,
  calculateRealizedPnl,
  checkDrawdown,
  checkProfitTarget,
} from './pnl.js';
import { createPassPayout } from '../services/payout.js';
import { POSITION_FEE_RATE } from '@setl8/constants';
import { positionService } from './positions.js';
import { logger } from '../lib/logger.js';
import { submitResultNoPayoutOnChain, submitResultWithPayoutOnChain, buildResultHash, phaseNumber, type PhaseResultData } from '../lib/solana.js';
import { sendTraderAlert, shouldSendDrawdownAlert } from '../telegram/alerts.js';

const MAX_STALENESS_MS = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// EvaluatorService
// ---------------------------------------------------------------------------

class EvaluatorService {
  // -------------------------------------------------------------------------
  // setApp — kept for API compatibility; WS delivery now uses the registry
  // -------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setApp(_app: unknown): void {
    // No-op: the evaluator emits via ws-registry, not via the Fastify app
  }

  // -------------------------------------------------------------------------
  // evaluateAttempt
  // -------------------------------------------------------------------------

  async evaluateAttempt(attemptId: string): Promise<void> {
    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        trader: { select: { walletAddress: true } },
        positions: {
          where: { status: PositionStatus.Open },
        },
      },
    });

    if (!attempt || attempt.status !== AttemptStatus.Active) return;

    // -----------------------------------------------------------------------
    // 1. Recalculate unrealised P&L for each open position
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // 1a. Check SL/TP triggers on open positions
    // -----------------------------------------------------------------------

    for (const pos of attempt.positions) {
      // Skip pending limit orders (handled below)
      if (pos.orderStatus === 'PENDING') continue;

      const priceData = marketService.getPrice(pos.market as Market);
      if (!priceData) continue;
      if (Date.now() - priceData.publishTime > MAX_STALENESS_MS) {
        logger.warn({ market: pos.market }, 'Stale price — skipping SL/TP check');
        continue;
      }
      const currentPrice = priceData.price;

      // Check Stop Loss
      if (pos.stopLoss) {
        const sl = Number(pos.stopLoss);
        const triggered =
          (pos.side === PositionSide.Long && currentPrice <= sl) ||
          (pos.side === PositionSide.Short && currentPrice >= sl);

        if (triggered) {
          try {
            const closed = await positionService.closePosition(pos.id, attempt.traderId, sl, 'STOP_LOSS');
            sendTraderAlert(attempt.traderId, {
              type: 'sl_hit',
              position: { market: pos.market, side: pos.side, exitPrice: sl, pnl: Number(closed.realizedPnl ?? 0) },
            }).catch(() => {});
          } catch {
            // position may already be closed
          }
          continue; // skip P&L calc for this position
        }
      }

      // Check Take Profit
      if (pos.takeProfit) {
        const tp = Number(pos.takeProfit);
        const triggered =
          (pos.side === PositionSide.Long && currentPrice >= tp) ||
          (pos.side === PositionSide.Short && currentPrice <= tp);

        if (triggered) {
          try {
            const closed = await positionService.closePosition(pos.id, attempt.traderId, tp, 'TAKE_PROFIT');
            sendTraderAlert(attempt.traderId, {
              type: 'tp_hit',
              position: { market: pos.market, side: pos.side, exitPrice: tp, pnl: Number(closed.realizedPnl ?? 0) },
            }).catch(() => {});
          } catch {
            // position may already be closed
          }
          continue;
        }
      }
    }

    // -----------------------------------------------------------------------
    // 1b. Check pending limit orders for fill
    // -----------------------------------------------------------------------

    const pendingOrders = await prisma.position.findMany({
      where: { attemptId: attemptId, orderStatus: 'PENDING' },
    });

    for (const order of pendingOrders) {
      const priceData = marketService.getPrice(order.market as Market);
      if (!priceData) continue;
      if (Date.now() - priceData.publishTime > MAX_STALENESS_MS) {
        logger.warn({ market: order.market }, 'Stale price — skipping limit fill');
        continue;
      }

      const currentPrice = priceData.price;
      const limitPrice = Number(order.limitPrice);

      // Long limit = buy when price drops to or below limit
      // Short limit = sell when price rises to or above limit
      const shouldFill =
        (order.side === PositionSide.Long && currentPrice <= limitPrice) ||
        (order.side === PositionSide.Short && currentPrice >= limitPrice);

      if (shouldFill) {
        const currentBalance = Number(attempt.currentBalance);
        const fee = currentBalance * POSITION_FEE_RATE;
        const assetQty = limitPrice > 0 ? Number(order.size) / limitPrice : 0;

        await prisma.$transaction(async (tx) => {
          // Atomic check: only fill if still PENDING (prevents TOCTOU with cancelLimitOrder)
          const updated = await tx.position.updateMany({
            where: { id: order.id, orderStatus: 'PENDING' },
            data: {
              entryPrice: limitPrice,
              assetQuantity: assetQty,
              openFee: fee,
              orderStatus: 'FILLED',
            },
          });
          if (updated.count === 0) return; // was cancelled between fetch and fill
          await tx.attempt.update({
            where: { id: attemptId },
            data: { realizedPnl: { decrement: fee } },
          });
        });

        // Telegram alert (non-blocking)
        sendTraderAlert(attempt.traderId, {
          type: 'limit_filled',
          position: { market: order.market, side: order.side, size: Number(order.size), entryPrice: limitPrice },
        }).catch(() => {});
      }
    }

    // -----------------------------------------------------------------------
    // 1c. Recalculate unrealised P&L for each open (filled) position
    // -----------------------------------------------------------------------

    // Re-fetch positions after SL/TP/fill changes
    const currentPositions = await prisma.position.findMany({
      where: { attemptId, status: PositionStatus.Open, orderStatus: 'FILLED' },
    });

    let totalUnrealizedPnl = 0;
    const positionUpdates: Array<{ id: string; unrealizedPnl: number }> = [];

    for (const pos of currentPositions) {
      const priceData = marketService.getPrice(pos.market as Market);
      if (!priceData) continue;
      if (Date.now() - priceData.publishTime > MAX_STALENESS_MS) continue;

      const unrealizedPnl = calculateUnrealizedPnl(
        { side: pos.side as PositionSide, entryPrice: pos.entryPrice, size: pos.remainingSize || pos.size },
        priceData.price,
      );

      totalUnrealizedPnl += unrealizedPnl;
      positionUpdates.push({ id: pos.id, unrealizedPnl });
    }

    // -----------------------------------------------------------------------
    // 2. Persist position unrealised P&L updates
    // -----------------------------------------------------------------------

    await Promise.all(
      positionUpdates.map(({ id, unrealizedPnl }) =>
        prisma.position.update({ where: { id }, data: { unrealizedPnl } }),
      ),
    );

    // -----------------------------------------------------------------------
    // 3. Calculate new currentBalance
    // -----------------------------------------------------------------------

    const realizedPnl = Number(attempt.realizedPnl);
    const totalPayoutTaken = Number(attempt.totalPayoutTaken);
    const startingBalance = Number(attempt.startingBalance);
    const currentBalance =
      startingBalance + realizedPnl + totalUnrealizedPnl - totalPayoutTaken;

    // Peak balance only ever rises
    const oldPeak = Number(attempt.peakBalance);
    const newPeak = currentBalance > oldPeak ? currentBalance : oldPeak;

    // -----------------------------------------------------------------------
    // 4. Dynamic drawdown check
    // -----------------------------------------------------------------------

    // Static floor = 8% from starting balance (never changes)
    const staticFloor = Number(attempt.maxDrawdownFloor); // startingBalance * 0.92

    // Dynamic DD: if in trailing mode, use 4% from peak (whichever is tighter)
    let effectiveFloor: number;
    if (attempt.inTrailingMode) {
      const trailingFloor = newPeak * 0.96; // 4% from peak
      effectiveFloor = Math.max(staticFloor, trailingFloor);
    } else {
      effectiveFloor = staticFloor;
    }

    const { breached, drawdownPct } = checkDrawdown(
      {
        startingBalance: attempt.startingBalance,
        peakBalance: newPeak,
        maxDrawdownFloor: effectiveFloor,
        profitTarget: attempt.profitTarget,
      },
      currentBalance,
    );

    // Only log every ~10 seconds to reduce noise
    if (currentPositions.length > 0 && Date.now() % 10000 < 1100) {
      logger.debug(
        `[evaluator] attempt ${attempt.id.slice(0, 8)} | balance: $${currentBalance.toFixed(2)} | peak: $${newPeak.toFixed(2)} | floor: $${effectiveFloor.toFixed(2)} | mode: ${attempt.inTrailingMode ? 'trailing' : 'static'} | dd: ${((1 - currentBalance / newPeak) * 100).toFixed(2)}%`,
      );
    }

    // Telegram drawdown alerts (non-blocking)
    if (currentPositions.length > 0) {
      const ddRange = newPeak - effectiveFloor;
      const ddUsed = ddRange > 0 ? ((newPeak - currentBalance) / ddRange) * 100 : 0;
      if (ddUsed >= 80) {
        shouldSendDrawdownAlert(attemptId, 80).then((send) => {
          if (send) sendTraderAlert(attempt.traderId, { type: 'drawdown_warning', level: 80, balance: currentBalance, floor: effectiveFloor });
        }).catch(() => {});
      } else if (ddUsed >= 60) {
        shouldSendDrawdownAlert(attemptId, 60).then((send) => {
          if (send) sendTraderAlert(attempt.traderId, { type: 'drawdown_warning', level: 60, balance: currentBalance, floor: effectiveFloor });
        }).catch(() => {});
      }
    }

    if (breached) {
      logger.warn(
        `[evaluator] LIQUIDATING attempt ${attempt.id} | balance: $${currentBalance.toFixed(2)} | floor: $${effectiveFloor.toFixed(2)} | peak: $${newPeak.toFixed(2)} | mode: ${attempt.inTrailingMode ? 'trailing' : 'static'}`,
      );
      await this.failAttempt(
        attempt,
        currentBalance,
        newPeak,
        'Max drawdown breached',
      );

      // Telegram alert (non-blocking)
      sendTraderAlert(attempt.traderId, { type: 'account_failed', balance: currentBalance, floor: effectiveFloor, reason: 'Max drawdown breached' }).catch(() => {});
      return;
    }

    // -----------------------------------------------------------------------
    // 5. Check profit target
    // -----------------------------------------------------------------------

    const targetReached = checkProfitTarget(
      {
        startingBalance: attempt.startingBalance,
        peakBalance: newPeak,
        maxDrawdownFloor: attempt.maxDrawdownFloor,
        profitTarget: attempt.profitTarget,
      },
      currentBalance,
    );

    let newStatus: AttemptStatus = AttemptStatus.Active;
    let newPhase: AttemptPhase = attempt.phase as AttemptPhase;

    if (targetReached) {
      newStatus = AttemptStatus.Passed;
      // After passing, the NEXT attempt will be funded — this attempt keeps its phase
      // (phase was set correctly at creation based on passed count)
    }

    // -----------------------------------------------------------------------
    // 6. Persist attempt update
    // -----------------------------------------------------------------------

    const pnlPercent = ((currentBalance - startingBalance) / startingBalance) * 100;

    await prisma.attempt.update({
      where: { id: attemptId },
      data: {
        currentBalance,
        unrealizedPnl: totalUnrealizedPnl,
        peakBalance: newPeak,
        status: newStatus,
        phase: newPhase,
        ...(newStatus !== AttemptStatus.Active ? { endedAt: new Date() } : {}),
      },
    });

    // -----------------------------------------------------------------------
    // 7. Emit WebSocket update
    // -----------------------------------------------------------------------

    this.emitPnlUpdate(attempt.traderId, {
      attemptId,
      realizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
      currentBalance,
      pnlPercent,
      drawdownPct,
    });

    if (newStatus === AttemptStatus.Passed) {
      this.emitAttemptResult(attempt.traderId, {
        event: WsEvent.AttemptPassed,
        attemptId,
        attemptNumber: attempt.attemptNumber,
        finalPnlPercent: pnlPercent,
        reason: 'Profit target reached',
      });

      // Telegram alert (non-blocking)
      sendTraderAlert(attempt.traderId, { type: 'account_passed', balance: currentBalance, phase: attempt.phase }).catch(() => {});

      // Check for graduation (all 6 phases passed)
      try {
        const totalPassed = await prisma.attempt.count({
          where: { traderId: attempt.traderId, status: 'PASSED' },
        });
        if (totalPassed >= 6) {
          sendTraderAlert(attempt.traderId, { type: 'graduated' }).catch(() => {});
        }
      } catch {
        // ignore
      }

      // Auto-create payout for funded phases
      try {
        await createPassPayout(attemptId);
      } catch (err) {
        // Log but don't fail the evaluation — payout can be created manually
        const msg = err instanceof Error ? err.message : String(err);
        emitToTrader(attempt.traderId, {
          event: WsEvent.PnlUpdate,
          traderId: attempt.traderId,
          data: { error: `Payout creation failed: ${msg}` },
        });
      }

      // Sync on-chain state — fire and forget
      if (attempt.trader?.walletAddress) {
        const tradeCount = await prisma.position.count({
          where: { attemptId, status: PositionStatus.Closed },
        });
        const winCount = await prisma.position.count({
          where: { attemptId, status: PositionStatus.Closed, realizedPnl: { gt: 0 } },
        });

        const startBal = Math.round(Number(attempt.startingBalance) * 1_000_000);
        const endBal = Math.round(currentBalance * 1_000_000);
        const realPnl = Math.round(realizedPnl * 1_000_000);
        const peakBal = Math.round(newPeak * 1_000_000);
        const ddBps = Math.round((1 - currentBalance / newPeak) * 10000);

        const resultHash = buildResultHash({
          traderWallet: attempt.trader.walletAddress,
          startingBalance: startBal,
          endingBalance: endBal,
          realizedPnl: realPnl,
          totalTrades: tradeCount,
          passed: true,
        });

        const passedCount = await prisma.attempt.count({
          where: { traderId: attempt.traderId, status: 'PASSED' },
        });
        const currentPhase = phaseNumber(passedCount - 1);

        const phaseData: PhaseResultData = {
          startingBalance: startBal,
          endingBalance: endBal,
          realizedPnl: realPnl,
          totalTrades: tradeCount,
          winningTrades: winCount,
          maxDrawdownUsedBps: ddBps,
          drawdownModeAtEnd: attempt.inTrailingMode ? 1 : 0,
          peakBalance: peakBal,
          resultHash,
        };

        if (attempt.phase === 'EVALUATION') {
          submitResultNoPayoutOnChain({
            traderWallet: attempt.trader.walletAddress,
            passed: true,
            currentPhaseNumber: currentPhase,
            phaseData,
          }).catch((err) => {
            logger.error({ err: (err as Error).message }, '[evaluator] Failed on-chain eval pass');
          });
        } else {
          submitResultWithPayoutOnChain({
            traderWallet: attempt.trader.walletAddress,
            currentPhaseNumber: currentPhase,
            phaseData,
          }).catch((err) => {
            logger.error({ err: (err as Error).message }, '[evaluator] Failed on-chain funded pass');
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // failAttempt — force-close all open positions, mark attempt FAILED
  // -------------------------------------------------------------------------

  private async failAttempt(
    attempt: {
      id: string;
      traderId: string;
      attemptNumber: number;
      startingBalance: { toNumber(): number } | number;
      realizedPnl: { toNumber(): number } | number;
      trader?: { walletAddress: string };
    },
    currentBalance: number,
    peakBalance: number,
    reason: string,
  ): Promise<void> {
    const openPositions = await prisma.position.findMany({
      where: { attemptId: attempt.id, status: PositionStatus.Open },
    });

    let additionalRealizedPnl = 0;

    await prisma.$transaction(async (tx: TxClient) => {
      for (const pos of openPositions) {
        const priceData = marketService.getPrice(pos.market as Market);
        const exitPrice = priceData?.price ?? Number(pos.entryPrice);

        const realizedPnl = calculateRealizedPnl(
          { side: pos.side as PositionSide, entryPrice: pos.entryPrice, size: pos.size },
          exitPrice,
        );
        additionalRealizedPnl += realizedPnl;

        await tx.position.update({
          where: { id: pos.id },
          data: {
            status: PositionStatus.Closed,
            exitPrice,
            realizedPnl,
            unrealizedPnl: 0,
            closedAt: new Date(),
          },
        });
      }

      const finalRealizedPnl =
        Number(attempt.realizedPnl) + additionalRealizedPnl;

      await tx.attempt.update({
        where: { id: attempt.id },
        data: {
          status: AttemptStatus.Failed,
          currentBalance,
          peakBalance,
          realizedPnl: finalRealizedPnl,
          unrealizedPnl: 0,
          endedAt: new Date(),
        },
      });
    });

    const startingBalance = Number(attempt.startingBalance);
    const finalRealizedPnl = Number(attempt.realizedPnl) + additionalRealizedPnl;
    const finalPnlPercent =
      ((currentBalance - startingBalance) / startingBalance) * 100;

    this.emitAttemptResult(attempt.traderId, {
      event: WsEvent.AttemptFailed,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      finalPnlPercent,
      reason,
    });

    // Sync on-chain state — fire and forget (don't block evaluator tick)
    if (attempt.trader?.walletAddress) {
      const tradeCount = await prisma.position.count({
        where: { attemptId: attempt.id, status: PositionStatus.Closed },
      });
      const winCount = await prisma.position.count({
        where: { attemptId: attempt.id, status: PositionStatus.Closed, realizedPnl: { gt: 0 } },
      });

      const startBal = Math.round(Number(attempt.startingBalance) * 1_000_000);
      const endBal = Math.round(Math.max(0, currentBalance) * 1_000_000);
      const realPnl = Math.round(finalRealizedPnl * 1_000_000);
      const peakBal = Math.round(peakBalance * 1_000_000);
      const ddBps = peakBalance > 0 ? Math.round((1 - currentBalance / peakBalance) * 10000) : 0;

      const resultHash = buildResultHash({
        traderWallet: attempt.trader.walletAddress,
        startingBalance: startBal,
        endingBalance: endBal,
        realizedPnl: realPnl,
        totalTrades: tradeCount,
        passed: false,
      });

      const passedCount = await prisma.attempt.count({
        where: { traderId: attempt.traderId, status: 'PASSED' },
      });
      const currentPhase = phaseNumber(passedCount);

      submitResultNoPayoutOnChain({
        traderWallet: attempt.trader.walletAddress,
        passed: false,
        currentPhaseNumber: currentPhase,
        phaseData: {
          startingBalance: startBal,
          endingBalance: endBal,
          realizedPnl: realPnl,
          totalTrades: tradeCount,
          winningTrades: winCount,
          maxDrawdownUsedBps: ddBps,
          drawdownModeAtEnd: 0,
          peakBalance: peakBal,
          resultHash,
        },
      }).catch((err) => {
        logger.error({ err: (err as Error).message }, '[evaluator] Failed on-chain fail result');
      });
    }
  }

  // -------------------------------------------------------------------------
  // evaluateAll
  // -------------------------------------------------------------------------

  async evaluateAll(): Promise<void> {
    const activeAttempts = await prisma.attempt.findMany({
      where: { status: AttemptStatus.Active },
      select: { id: true },
    });

    await Promise.allSettled(
      activeAttempts.map((a: { id: string }) => this.evaluateAttempt(a.id)),
    );
  }

  // -------------------------------------------------------------------------
  // WebSocket helpers
  // -------------------------------------------------------------------------

  private emitPnlUpdate(
    traderId: string,
    data: {
      attemptId: string;
      realizedPnl: number;
      unrealizedPnl: number;
      currentBalance: number;
      pnlPercent: number;
      drawdownPct: number;
    },
  ): void {
    emitToTrader(traderId, { event: WsEvent.PnlUpdate, traderId, data });
  }

  private emitAttemptResult(
    traderId: string,
    data: {
      event: WsEvent.AttemptFailed | WsEvent.AttemptPassed;
      attemptId: string;
      attemptNumber: number;
      finalPnlPercent: number;
      reason: string;
    },
  ): void {
    emitToTrader(traderId, { event: data.event, traderId, data });
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const evaluatorService = new EvaluatorService();
