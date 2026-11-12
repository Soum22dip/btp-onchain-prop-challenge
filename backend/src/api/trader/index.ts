// =============================================================================
// Setl8 Backend — Trader Routes
//
// GET /profile    full trader profile + aggregated stats
// GET /pnl        current P&L for the active attempt (REST fallback for WS)
// =============================================================================

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Market, PositionSide } from '@setl8/types';
import { verifyJWT } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { marketService } from '../../synthetic/market.js';
import { calculateUnrealizedPnl, checkDrawdown } from '../../synthetic/pnl.js';
import { serializeDecimals } from '../../lib/serialization.js';

export const traderRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // GET /profile
  // -------------------------------------------------------------------------
  app.get('/profile', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;

    const trader = await prisma.trader.findUnique({
      where: { id: traderId },
      select: {
        id: true,
        walletAddress: true,
        status: true,
        fraudFlags: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { attempts: true } },
        payoutRequests: {
          where: { status: 'COMPLETED' },
          select: { amountUsd: true },
        },
        attempts: {
          where: { status: 'ACTIVE' },
          select: { id: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!trader) {
      return reply.status(404).send({ success: false, error: 'Trader not found' });
    }

    const totalPayoutsUsd = trader.payoutRequests.reduce(
      (sum, r) => sum + Number(r.amountUsd),
      0,
    );

    return reply.status(200).send({
      success: true,
      data: {
        id: trader.id,
        walletAddress: trader.walletAddress,
        status: trader.status,
        fraudFlags: trader.fraudFlags,
        createdAt: trader.createdAt,
        updatedAt: trader.updatedAt,
        totalAttempts: trader._count.attempts,
        activeAttemptId: trader.attempts[0]?.id ?? null,
        totalPayoutsUsd,
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /challenge — full active challenge data with computed fields
  // -------------------------------------------------------------------------
  app.get('/challenge', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;

    const attempt = await prisma.attempt.findFirst({
      where: { traderId, status: 'ACTIVE' },
      include: {
        positions: { where: { status: 'OPEN' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt) {
      return reply.status(200).send({ success: true, data: null });
    }

    // Recompute live unrealized P&L from in-memory prices
    let liveUnrealizedPnl = 0;
    for (const pos of attempt.positions) {
      const priceData = marketService.getPrice(pos.market as Market);
      if (!priceData) continue;
      liveUnrealizedPnl += calculateUnrealizedPnl(
        { side: pos.side as PositionSide, entryPrice: pos.entryPrice, size: pos.size },
        priceData.price,
      );
    }

    const realizedPnl = Number(attempt.realizedPnl);
    const startingBalance = Number(attempt.startingBalance);
    const accountSize = Number(attempt.accountSize);
    const totalPayoutTaken = Number(attempt.totalPayoutTaken);
    const currentBalance = startingBalance + realizedPnl + liveUnrealizedPnl - totalPayoutTaken;
    const peakBalance = Math.max(Number(attempt.peakBalance), currentBalance);
    const profitTarget = Number(attempt.profitTarget);
    const maxDrawdownFloor = Number(attempt.maxDrawdownFloor);

    const pnlPercent = ((currentBalance - startingBalance) / startingBalance) * 100;
    const { drawdownPct } = checkDrawdown(
      {
        startingBalance: attempt.startingBalance,
        peakBalance,
        maxDrawdownFloor: attempt.maxDrawdownFloor,
        profitTarget: attempt.profitTarget,
      },
      currentBalance,
    );

    // Compute margin in use
    const totalOpenMargin = attempt.positions.reduce(
      (sum, p) => sum + Number(p.marginUsed),
      0,
    );

    return reply.status(200).send({
      success: true,
      data: {
        attemptId: attempt.id,
        phase: attempt.phase,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        accountSize,
        startingBalance,
        currentBalance,
        peakBalance,
        realizedPnl,
        unrealizedPnl: liveUnrealizedPnl,
        totalPayoutTaken,
        equity: currentBalance,
        pnlPercent,
        drawdownPercent: drawdownPct,
        profitTarget,
        maxDrawdownFloor,
        targetPrice: profitTarget,
        drawdownPrice: maxDrawdownFloor,
        openPositions: attempt.positions.length,
        marginInUse: totalOpenMargin,
        availableBalance: currentBalance - totalOpenMargin,
        drawdownRemaining: currentBalance - maxDrawdownFloor,
        startedAt: attempt.startedAt,
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /trades — all positions (open + closed) for the active attempt
  // -------------------------------------------------------------------------
  app.get('/trades', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;

    const attempt = await prisma.attempt.findFirst({
      where: { traderId, status: 'ACTIVE' },
      select: {
        id: true,
        currentBalance: true,
        startingBalance: true,
        maxDrawdownFloor: true,
        peakBalance: true,
        status: true,
      },
    });

    if (!attempt) {
      return reply.status(404).send({ success: false, error: 'No active challenge' });
    }

    const positions = await prisma.position.findMany({
      where: { attemptId: attempt.id },
      orderBy: { openedAt: 'desc' },
      select: {
        id: true,
        market: true,
        side: true,
        status: true,
        orderType: true,
        orderStatus: true,
        size: true,
        remainingSize: true,
        marginUsed: true,
        entryPrice: true,
        exitPrice: true,
        leverage: true,
        unrealizedPnl: true,
        realizedPnl: true,
        openFee: true,
        closeFee: true,
        stopLoss: true,
        takeProfit: true,
        closeReason: true,
        openedAt: true,
        closedAt: true,
        assetQuantity: true,
      },
    });

    const trades = positions.map((p) => ({
      id: p.id,
      market: p.market,
      side: p.side,
      status: p.status,
      orderType: p.orderType,
      orderStatus: p.orderStatus,
      size: Number(p.size),
      remainingSize: Number(p.remainingSize),
      marginUsed: Number(p.marginUsed),
      entryPrice: Number(p.entryPrice),
      exitPrice: p.exitPrice ? Number(p.exitPrice) : null,
      leverage: Number(p.leverage),
      unrealizedPnl: Number(p.unrealizedPnl),
      realizedPnl: Number(p.realizedPnl ?? 0),
      openFee: Number(p.openFee),
      closeFee: Number(p.closeFee ?? 0),
      stopLoss: p.stopLoss ? Number(p.stopLoss) : null,
      takeProfit: p.takeProfit ? Number(p.takeProfit) : null,
      closeReason: p.closeReason,
      openedAt: p.openedAt,
      closedAt: p.closedAt,
      assetQuantity: Number(p.assetQuantity),
    }));

    const closedTrades = trades.filter((t) => t.status === 'CLOSED' && t.realizedPnl !== null);
    const realizedPnls = closedTrades.map((t) => t.realizedPnl);

    return reply.send({
      success: true,
      data: {
        attempt: {
          id: attempt.id,
          currentBalance: Number(attempt.currentBalance),
          startingBalance: Number(attempt.startingBalance),
          maxDrawdownFloor: Number(attempt.maxDrawdownFloor),
          peakBalance: Number(attempt.peakBalance),
          status: attempt.status,
          drawdownRemaining:
            Number(attempt.currentBalance) - Number(attempt.maxDrawdownFloor),
        },
        trades,
        summary: {
          totalTrades: positions.length,
          openTrades: positions.filter((p) => p.status === 'OPEN').length,
          closedTrades: closedTrades.length,
          wins: realizedPnls.filter((p) => p > 0).length,
          losses: realizedPnls.filter((p) => p <= 0).length,
          totalPnl: realizedPnls.reduce((s, p) => s + p, 0),
          bestTrade: realizedPnls.length > 0 ? Math.max(...realizedPnls) : 0,
          worstTrade: realizedPnls.length > 0 ? Math.min(...realizedPnls) : 0,
          totalFees: trades.reduce((s, t) => s + t.openFee + t.closeFee, 0),
        },
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /pnl  — current P&L snapshot for the active attempt
  // -------------------------------------------------------------------------
  app.get('/pnl', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;

    const attempt = await prisma.attempt.findFirst({
      where: { traderId, status: 'ACTIVE' },
      include: {
        positions: { where: { status: 'OPEN' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt) {
      return reply.status(200).send({
        success: true,
        data: null,
      });
    }

    // Recompute live unrealized P&L from in-memory prices
    let liveUnrealizedPnl = 0;
    for (const pos of attempt.positions) {
      const priceData = marketService.getPrice(pos.market as Market);
      if (!priceData) continue;
      liveUnrealizedPnl += calculateUnrealizedPnl(
        { side: pos.side as PositionSide, entryPrice: pos.entryPrice, size: pos.size },
        priceData.price,
      );
    }

    const realizedPnl = Number(attempt.realizedPnl);
    const startingBalance = Number(attempt.startingBalance);
    const totalPayoutTaken = Number(attempt.totalPayoutTaken);
    const currentBalance = startingBalance + realizedPnl + liveUnrealizedPnl - totalPayoutTaken;
    const peakBalance = Math.max(Number(attempt.peakBalance), currentBalance);

    const pnlPercent = ((currentBalance - startingBalance) / startingBalance) * 100;
    const { drawdownPct } = checkDrawdown(
      {
        startingBalance: attempt.startingBalance,
        peakBalance,
        maxDrawdownFloor: attempt.maxDrawdownFloor,
        profitTarget: attempt.profitTarget,
      },
      currentBalance,
    );

    return reply.status(200).send({
      success: true,
      data: {
        attemptId: attempt.id,
        startingBalance,
        currentBalance,
        realizedPnl,
        unrealizedPnl: liveUnrealizedPnl,
        totalPayoutTaken,
        pnlPercent,
        drawdownPercent: drawdownPct,
        profitTarget: Number(attempt.profitTarget),
        maxDrawdownFloor: Number(attempt.maxDrawdownFloor),
        openPositions: attempt.positions.length,
      },
    });
  });
};
