// =============================================================================
// Setl8 Backend — PositionService
//
// openPosition      — market order: validate, price-check, create in DB
// openLimitOrder    — limit order: reserve margin, wait for fill
// closePosition     — full exit at current market price
// partialClose      — close a percentage of a position
// updateSlTp        — modify SL/TP on an open position
// cancelLimitOrder  — cancel a pending limit order
// =============================================================================

import { AttemptStatus, Market, PositionSide, PositionStatus } from '@setl8/types';
import type { $Enums } from '@prisma/client';
import { MAX_LEVERAGE, MIN_POSITION_SIZE_USD, POSITION_FEE_RATE } from '@setl8/constants';
import type { Market as MarketEnum } from '@setl8/types';
import { prisma } from '../lib/prisma.js';
import { marketService } from './market.js';
import { calculateRealizedPnl, calculateUnrealizedPnl } from './pnl.js';
import { evaluatorService } from './evaluator.js';
import { sendTraderAlert } from '../telegram/alerts.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpenPositionParams {
  traderId: string;
  attemptId: string;
  market: Market;
  side: PositionSide;
  sizeUsd: number;
  assetQuantity?: number;
  stopLoss?: number;
  takeProfit?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Forex markets — closed Friday 22:00 UTC to Sunday 22:00 UTC */
const FOREX_MARKETS = [
  'EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD', 'USD_CHF',
  'NZD_USD', 'EUR_GBP', 'EUR_JPY', 'GBP_JPY', 'EUR_CHF', 'AUD_JPY',
  'USD_MXN', 'USD_SGD',
];

function validateSlTp(
  side: PositionSide,
  entryPrice: number,
  stopLoss?: number,
  takeProfit?: number,
  currentPrice?: number,
): void {
  const refPrice = currentPrice ?? entryPrice;
  if (stopLoss !== undefined) {
    if (side === PositionSide.Long && stopLoss >= refPrice) {
      throw Object.assign(
        new Error('Stop loss must be below current price for long positions'),
        { code: 'INVALID_SL' },
      );
    }
    if (side === PositionSide.Short && stopLoss <= refPrice) {
      throw Object.assign(
        new Error('Stop loss must be above current price for short positions'),
        { code: 'INVALID_SL' },
      );
    }
  }
  if (takeProfit !== undefined) {
    if (side === PositionSide.Long && takeProfit <= refPrice) {
      throw Object.assign(
        new Error('Take profit must be above current price for long positions'),
        { code: 'INVALID_TP' },
      );
    }
    if (side === PositionSide.Short && takeProfit >= refPrice) {
      throw Object.assign(
        new Error('Take profit must be below current price for short positions'),
        { code: 'INVALID_TP' },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// PositionService
// ---------------------------------------------------------------------------

class PositionService {
  private readonly MAX_OPEN_POSITIONS = 10;

  // -------------------------------------------------------------------------
  // getAttemptAndValidate — shared validation for open operations
  // -------------------------------------------------------------------------

  private async getAttemptAndValidate(traderId: string, attemptId: string) {
    // Use serializable transaction to prevent race condition on position count
    return prisma.$transaction(async (tx) => {
      const attempt = await tx.attempt.findUnique({
        where: { id: attemptId },
      });

      if (!attempt) {
        throw Object.assign(new Error('Attempt not found'), { code: 'NOT_FOUND' });
      }
      if (attempt.traderId !== traderId) {
        throw Object.assign(new Error('Attempt does not belong to trader'), { code: 'FORBIDDEN' });
      }
      if (attempt.status !== AttemptStatus.Active) {
        throw Object.assign(
          new Error(`Attempt is ${attempt.status} — cannot open new positions`),
          { code: 'ATTEMPT_INACTIVE' },
        );
      }

      const openCount = await tx.position.count({
        where: { attemptId, status: PositionStatus.Open },
      });
      if (openCount >= this.MAX_OPEN_POSITIONS) {
        throw Object.assign(
          new Error(`Maximum of ${this.MAX_OPEN_POSITIONS} open positions per attempt`),
          { code: 'MAX_POSITIONS_REACHED' },
        );
      }

      return attempt;
    }, { isolationLevel: 'Serializable' });
  }

  // -------------------------------------------------------------------------
  // openPosition — market order
  // -------------------------------------------------------------------------

  async openPosition(params: OpenPositionParams) {
    const { traderId, attemptId, market, side, stopLoss, takeProfit } = params;
    let { sizeUsd, assetQuantity } = params;

    const attempt = await this.getAttemptAndValidate(traderId, attemptId);

    if (sizeUsd < MIN_POSITION_SIZE_USD) {
      throw Object.assign(
        new Error(`Minimum position size is $${MIN_POSITION_SIZE_USD}`),
        { code: 'SIZE_TOO_SMALL' },
      );
    }

    const maxLev = MAX_LEVERAGE[market as MarketEnum];
    if (!maxLev) {
      throw Object.assign(new Error(`Unknown market: ${market}`), { code: 'INVALID_MARKET' });
    }
    const leverage = maxLev;
    const marginUsed = sizeUsd / leverage;
    const currentBalance = Number(attempt.currentBalance);
    const startingBalance = Number(attempt.startingBalance);
    const openFee = Math.max(startingBalance, sizeUsd) * POSITION_FEE_RATE;

    // Sum margin of existing open positions
    const openPositions = await prisma.position.findMany({
      where: { attemptId, status: PositionStatus.Open },
      select: { marginUsed: true },
    });
    const totalOpenMargin = openPositions.reduce((sum, p) => sum + Number(p.marginUsed), 0);
    const availableBalance = currentBalance - totalOpenMargin;

    if (marginUsed + openFee > availableBalance) {
      throw Object.assign(
        new Error(
          `Insufficient balance — need $${(marginUsed + openFee).toFixed(2)} ` +
          `(margin $${marginUsed.toFixed(2)} + fee $${openFee.toFixed(2)}) ` +
          `but only $${availableBalance.toFixed(2)} available`,
        ),
        { code: 'INSUFFICIENT_BALANCE' },
      );
    }

    const priceData = marketService.getPrice(market);
    if (!priceData) {
      throw Object.assign(
        new Error(`No price available for ${market} — try again shortly`),
        { code: 'NO_PRICE' },
      );
    }

    const entryPrice = priceData.price;

    // Block forex trades during weekend market closure
    if (FOREX_MARKETS.includes(market)) {
      const now = new Date();
      const day = now.getUTCDay();
      const hour = now.getUTCHours();
      // Forex closed: Friday 22:00 UTC → Sunday 22:00 UTC
      if (day === 6 || (day === 5 && hour >= 22) || (day === 0 && hour < 22)) {
        throw Object.assign(
          new Error('Forex markets are closed on weekends (Fri 22:00 – Sun 22:00 UTC)'),
          { code: 'MARKET_CLOSED' },
        );
      }
    }

    // Validate SL/TP against current market price
    validateSlTp(side, entryPrice, stopLoss, takeProfit, entryPrice);

    // Compute asset quantity if not provided
    if (!assetQuantity) {
      assetQuantity = entryPrice > 0 ? sizeUsd / entryPrice : 0;
    }

    // Count open positions BEFORE creating this one to detect new cluster
    const openCountBefore = await prisma.position.count({
      where: { attemptId, status: PositionStatus.Open, orderStatus: { not: 'CANCELLED' } },
    });
    const isNewCluster = openCountBefore === 0;

    const position = await prisma.$transaction(async (tx) => {
      const pos = await tx.position.create({
        data: {
          attemptId,
          traderId,
          market: market as unknown as $Enums.Market,
          side: side as unknown as $Enums.PositionSide,
          status: PositionStatus.Open,
          entryPrice,
          size: sizeUsd,
          assetQuantity,
          leverage,
          marginUsed,
          openFee,
          unrealizedPnl: 0,
          fundingPaid: 0,
          stopLoss: stopLoss ?? null,
          takeProfit: takeProfit ?? null,
          orderType: 'MARKET',
          orderStatus: 'FILLED',
          remainingSize: sizeUsd,
          closedSize: 0,
          openedAt: new Date(),
        },
      });

      // Deduct open fee
      const newRealizedPnl = Number(attempt.realizedPnl) - openFee;

      const allOpen = await tx.position.findMany({
        where: { attemptId, status: PositionStatus.Open },
      });
      let totalUnrealizedPnl = 0;
      for (const p of allOpen) {
        const pd = marketService.getPrice(p.market as Market);
        if (!pd) continue;
        totalUnrealizedPnl += calculateUnrealizedPnl(
          { side: p.side as PositionSide, entryPrice: p.entryPrice, size: p.size },
          pd.price,
        );
      }

      // Set tradeStartBalance when this is the first position in a new cluster
      await tx.attempt.update({
        where: { id: attemptId },
        data: {
          realizedPnl: newRealizedPnl,
          unrealizedPnl: totalUnrealizedPnl,
          ...(isNewCluster ? { tradeStartBalance: currentBalance } : {}),
        },
      });

      return pos;
    });

    return position;
  }

  // -------------------------------------------------------------------------
  // openLimitOrder
  // -------------------------------------------------------------------------

  async openLimitOrder(params: {
    traderId: string;
    attemptId: string;
    market: Market;
    side: PositionSide;
    sizeUsd: number;
    limitPrice: number;
    stopLoss?: number;
    takeProfit?: number;
  }) {
    const { traderId, attemptId, market, side, sizeUsd, limitPrice, stopLoss, takeProfit } = params;

    const attempt = await this.getAttemptAndValidate(traderId, attemptId);

    if (sizeUsd < MIN_POSITION_SIZE_USD) {
      throw Object.assign(new Error(`Minimum position size is $${MIN_POSITION_SIZE_USD}`), { code: 'SIZE_TOO_SMALL' });
    }
    if (!limitPrice || limitPrice <= 0) {
      throw Object.assign(new Error('Limit price must be positive'), { code: 'INVALID_LIMIT_PRICE' });
    }

    // Validate SL/TP against limit price (the intended entry)
    validateSlTp(side, limitPrice, stopLoss, takeProfit);

    const maxLev = MAX_LEVERAGE[market as MarketEnum];
    if (!maxLev) {
      throw Object.assign(new Error(`Unknown market: ${market}`), { code: 'INVALID_MARKET' });
    }
    const leverage = maxLev;
    const marginUsed = sizeUsd / leverage;

    // Check margin (no fee charged until filled)
    const openPositions = await prisma.position.findMany({
      where: { attemptId, status: PositionStatus.Open },
      select: { marginUsed: true },
    });
    const totalOpenMargin = openPositions.reduce((sum, p) => sum + Number(p.marginUsed), 0);
    const availableBalance = Number(attempt.currentBalance) - totalOpenMargin;

    if (marginUsed > availableBalance) {
      throw Object.assign(
        new Error(`Insufficient balance for margin reservation ($${marginUsed.toFixed(2)} needed, $${availableBalance.toFixed(2)} available)`),
        { code: 'INSUFFICIENT_BALANCE' },
      );
    }

    const assetQuantity = limitPrice > 0 ? sizeUsd / limitPrice : 0;

    return prisma.position.create({
      data: {
        attemptId,
        traderId,
        market: market as unknown as $Enums.Market,
        side: side as unknown as $Enums.PositionSide,
        status: PositionStatus.Open,
        entryPrice: 0, // not filled yet
        size: sizeUsd,
        assetQuantity,
        leverage,
        marginUsed,
        openFee: 0, // charged when filled
        unrealizedPnl: 0,
        fundingPaid: 0,
        stopLoss: stopLoss ?? null,
        takeProfit: takeProfit ?? null,
        orderType: 'LIMIT',
        limitPrice,
        orderStatus: 'PENDING',
        remainingSize: sizeUsd,
        closedSize: 0,
        openedAt: new Date(),
      },
    });
  }

  // -------------------------------------------------------------------------
  // closePosition — full exit
  // -------------------------------------------------------------------------

  async closePosition(positionId: string, traderId: string, exitPriceOverride?: number, closeReason = 'MANUAL') {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { attempt: true },
    });

    if (!position) {
      throw Object.assign(new Error('Position not found'), { code: 'NOT_FOUND' });
    }
    if (position.traderId !== traderId) {
      throw Object.assign(new Error('Position does not belong to trader'), { code: 'FORBIDDEN' });
    }
    if (position.status !== PositionStatus.Open) {
      throw Object.assign(new Error(`Position is already ${position.status}`), { code: 'POSITION_NOT_OPEN' });
    }

    let exitPrice = exitPriceOverride;
    if (!exitPrice) {
      const priceData = marketService.getPrice(position.market as Market);
      if (!priceData) {
        throw Object.assign(new Error(`No price available for ${position.market}`), { code: 'NO_PRICE' });
      }
      exitPrice = priceData.price;
    }

    const currentBalance = Number(position.attempt.currentBalance);
    const posNotional = Number(position.remainingSize) || Number(position.size);
    const closeFee = Math.max(Number(position.attempt.startingBalance), posNotional) * POSITION_FEE_RATE;

    const grossRealizedPnl = calculateRealizedPnl(
      { side: position.side as PositionSide, entryPrice: position.entryPrice, size: posNotional },
      exitPrice,
    );
    const fundingPaid = Number(position.fundingPaid);
    const realizedPnl = grossRealizedPnl - fundingPaid - closeFee;

    const closedPosition = await prisma.$transaction(async (tx) => {
      const closed = await tx.position.update({
        where: { id: positionId },
        data: {
          status: PositionStatus.Closed,
          exitPrice,
          realizedPnl,
          closeFee,
          unrealizedPnl: 0,
          closedAt: new Date(),
          closeReason,
          remainingSize: 0,
          closedSize: Number(position.size),
        },
      });

      const currentAttempt = await tx.attempt.findUniqueOrThrow({ where: { id: position.attemptId } });

      const stillOpen = await tx.position.findMany({
        where: { attemptId: position.attemptId, status: PositionStatus.Open },
      });
      let newUnrealizedPnl = 0;
      for (const p of stillOpen) {
        const pd = marketService.getPrice(p.market as Market);
        if (!pd) continue;
        newUnrealizedPnl += calculateUnrealizedPnl(
          { side: p.side as PositionSide, entryPrice: p.entryPrice, size: p.size },
          pd.price,
        );
      }

      const newRealizedPnl = Number(currentAttempt.realizedPnl) + realizedPnl;
      const startBal = Number(currentAttempt.startingBalance);
      const balAfterClose = startBal + newRealizedPnl + newUnrealizedPnl - Number(currentAttempt.totalPayoutTaken);
      const tradeStartBal = Number(currentAttempt.tradeStartBalance) || balAfterClose;

      // Count remaining open positions after this close
      const remainingOpen = stillOpen.length;

      // Dynamic DD mode transitions (only on position close)
      const prevTrailingMode = currentAttempt.inTrailingMode;
      let inTrailingMode = prevTrailingMode;
      if (!inTrailingMode) {
        // Activate trailing: gained 1% from trade cluster start
        if (tradeStartBal > 0 && balAfterClose >= tradeStartBal * 1.01) {
          inTrailingMode = true;
        }
      } else {
        // Deactivate trailing: lost 1% of current balance from trade cluster start
        const lossFromStart = tradeStartBal - balAfterClose;
        if (lossFromStart > 0 && lossFromStart >= balAfterClose * 0.01) {
          inTrailingMode = false;
        }
        // Small losses or fee-only round trips: stays trailing
      }

      // Telegram alert on DD mode change (non-blocking)
      if (inTrailingMode !== prevTrailingMode) {
        const peak = Math.max(Number(currentAttempt.peakBalance), balAfterClose);
        const floor = Number(currentAttempt.maxDrawdownFloor);
        sendTraderAlert(position.traderId, {
          type: 'dd_mode_switch',
          newMode: inTrailingMode ? 'trailing' : 'static',
          peak,
          floor: inTrailingMode ? Math.max(floor, peak * 0.96) : floor,
        }).catch(() => {});
      }

      // Reset tradeStartBalance when all positions are closed (cluster ends)
      const newTradeStartBalance = remainingOpen === 0 ? balAfterClose : tradeStartBal;

      await tx.attempt.update({
        where: { id: position.attemptId },
        data: {
          realizedPnl: newRealizedPnl,
          unrealizedPnl: newUnrealizedPnl,
          inTrailingMode,
          tradeStartBalance: newTradeStartBalance,
        },
      });

      return closed;
    });

    await evaluatorService.evaluateAttempt(position.attemptId);
    return closedPosition;
  }

  // -------------------------------------------------------------------------
  // partialClose — close a percentage of a position
  // -------------------------------------------------------------------------

  async partialClose(positionId: string, closePercent: number, traderId: string) {
    if (closePercent <= 0 || closePercent >= 100) {
      throw Object.assign(new Error('Close percent must be between 1 and 99'), { code: 'INVALID_PERCENT' });
    }

    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { attempt: true },
    });

    if (!position) throw Object.assign(new Error('Position not found'), { code: 'NOT_FOUND' });
    if (position.traderId !== traderId) throw Object.assign(new Error('Not your position'), { code: 'FORBIDDEN' });
    if (position.status !== PositionStatus.Open) throw Object.assign(new Error('Position not open'), { code: 'POSITION_NOT_OPEN' });

    const priceData = marketService.getPrice(position.market as Market);
    if (!priceData) throw Object.assign(new Error('Price unavailable'), { code: 'NO_PRICE' });

    const currentPrice = priceData.price;
    const remainingSize = Number(position.remainingSize) || Number(position.size);
    const closeSize = remainingSize * (closePercent / 100);
    const closeQuantity = Number(position.assetQuantity) * (closePercent / 100);

    const pnl = calculateRealizedPnl(
      { side: position.side as PositionSide, entryPrice: position.entryPrice, size: closeSize },
      currentPrice,
    );

    const currentBalance = Number(position.attempt.currentBalance);
    const closeFee = Math.max(Number(position.attempt.startingBalance), closeSize) * POSITION_FEE_RATE;

    const newRemainingSize = remainingSize - closeSize;
    const newClosedSize = Number(position.closedSize) + closeSize;
    const newRemainingQuantity = Number(position.assetQuantity) - closeQuantity;
    const isFully = newRemainingSize < 0.01;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.position.update({
        where: { id: positionId },
        data: {
          remainingSize: isFully ? 0 : newRemainingSize,
          closedSize: newClosedSize,
          assetQuantity: isFully ? 0 : newRemainingQuantity,
          realizedPnl: { increment: pnl },
          closeFee: closeFee,
          status: isFully ? PositionStatus.Closed : PositionStatus.Open,
          closedAt: isFully ? new Date() : null,
          closeReason: isFully ? 'MANUAL' : null,
        },
      });

      const netPnl = pnl - closeFee;
      const currentAttempt = await tx.attempt.findUniqueOrThrow({ where: { id: position.attemptId } });
      const newRealizedPnl = Number(currentAttempt.realizedPnl) + netPnl;
      const startBal = Number(currentAttempt.startingBalance);

      // Recalculate unrealized P&L for remaining open positions
      const stillOpen = await tx.position.findMany({
        where: { attemptId: position.attemptId, status: PositionStatus.Open },
      });
      let newUnrealizedPnl = 0;
      for (const p of stillOpen) {
        const pd = marketService.getPrice(p.market as Market);
        if (!pd) continue;
        newUnrealizedPnl += calculateUnrealizedPnl(
          { side: p.side as PositionSide, entryPrice: p.entryPrice, size: p.size },
          pd.price,
        );
      }

      const balAfterClose = startBal + newRealizedPnl + newUnrealizedPnl - Number(currentAttempt.totalPayoutTaken);
      const tradeStartBal = Number(currentAttempt.tradeStartBalance) || balAfterClose;
      const remainingOpen = stillOpen.length;

      // Dynamic DD mode transitions (only when a position fully closes)
      const prevTrailingMode = currentAttempt.inTrailingMode;
      let inTrailingMode = prevTrailingMode;
      if (isFully) {
        if (!inTrailingMode) {
          if (tradeStartBal > 0 && balAfterClose >= tradeStartBal * 1.01) {
            inTrailingMode = true;
          }
        } else {
          const lossFromStart = tradeStartBal - balAfterClose;
          if (lossFromStart > 0 && lossFromStart >= balAfterClose * 0.01) {
            inTrailingMode = false;
          }
        }
      }

      // Telegram alert on DD mode change (non-blocking)
      if (inTrailingMode !== prevTrailingMode) {
        const peak = Math.max(Number(currentAttempt.peakBalance), balAfterClose);
        const floor = Number(currentAttempt.maxDrawdownFloor);
        sendTraderAlert(position.traderId, {
          type: 'dd_mode_switch',
          newMode: inTrailingMode ? 'trailing' : 'static',
          peak,
          floor: inTrailingMode ? Math.max(floor, peak * 0.96) : floor,
        }).catch(() => {});
      }

      const newTradeStartBalance = remainingOpen === 0 ? balAfterClose : tradeStartBal;

      await tx.attempt.update({
        where: { id: position.attemptId },
        data: {
          realizedPnl: newRealizedPnl,
          inTrailingMode,
          tradeStartBalance: newTradeStartBalance,
        },
      });

      return updated;
    });

    await evaluatorService.evaluateAttempt(position.attemptId);
    return result;
  }

  // -------------------------------------------------------------------------
  // updateSlTp — modify SL/TP on an open position
  // -------------------------------------------------------------------------

  async updateSlTp(positionId: string, traderId: string, stopLoss?: number | null, takeProfit?: number | null) {
    const position = await prisma.position.findUnique({ where: { id: positionId } });

    if (!position) throw Object.assign(new Error('Position not found'), { code: 'NOT_FOUND' });
    if (position.traderId !== traderId) throw Object.assign(new Error('Not your position'), { code: 'FORBIDDEN' });
    if (position.status !== PositionStatus.Open) throw Object.assign(new Error('Position not open'), { code: 'POSITION_NOT_OPEN' });

    const entryPrice = Number(position.entryPrice);

    // Validate new SL/TP against current market price
    const currentPriceData = marketService.getPrice(position.market as Market);
    const currentPrice = currentPriceData?.price ?? entryPrice;

    if (stopLoss !== undefined && stopLoss !== null) {
      validateSlTp(position.side as PositionSide, entryPrice, stopLoss, undefined, currentPrice);
    }
    if (takeProfit !== undefined && takeProfit !== null) {
      validateSlTp(position.side as PositionSide, entryPrice, undefined, takeProfit, currentPrice);
    }

    return prisma.position.update({
      where: { id: positionId },
      data: {
        stopLoss: stopLoss === null ? null : stopLoss,
        takeProfit: takeProfit === null ? null : takeProfit,
      },
    });
  }

  // -------------------------------------------------------------------------
  // cancelLimitOrder
  // -------------------------------------------------------------------------

  async cancelLimitOrder(positionId: string, traderId: string) {
    const position = await prisma.position.findUnique({ where: { id: positionId } });

    if (!position) throw Object.assign(new Error('Position not found'), { code: 'NOT_FOUND' });
    if (position.traderId !== traderId) throw Object.assign(new Error('Not your position'), { code: 'FORBIDDEN' });
    if (position.orderStatus !== 'PENDING') {
      throw Object.assign(new Error('Order already filled or cancelled'), { code: 'NOT_PENDING' });
    }

    return prisma.position.update({
      where: { id: positionId },
      data: {
        status: PositionStatus.Closed,
        orderStatus: 'CANCELLED',
        closedAt: new Date(),
        closeReason: 'CANCELLED',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const positionService = new PositionService();
