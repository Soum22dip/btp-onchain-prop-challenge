// =============================================================================
// Setl8 Backend — Public Routes (no auth required)
//
// GET /prices            real-time price snapshot for all active markets
// GET /markets           active market list (crypto from Redis + static forex/metals/indices)
// GET /vault/balance     payout vault token balances (Redis-cached 30 s)
// GET /vault/next-payout next batch date + pending totals (global)
// GET /vault/status      vault fire countdown + stats (powers homepage counter)
// GET /stats/overview    platform-wide aggregate stats
// GET /leaderboard       top traders by P&L, payouts, passed attempts
// =============================================================================

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { REDIS_KEYS, REDIS_VAULT_BALANCE_TTL_SECONDS } from '@setl8/constants';
import { config } from '../../config.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { getVaultBalance } from '../../lib/solana.js';
import { payoutQueue } from '../../jobs/index.js';
import { getLatestPrices } from '../../lib/pyth.js';
import { getActiveMarketList } from '../../services/marketCapFilter.js';
import { getCandles, VALID_INTERVALS, type CandleInterval } from '../../lib/candles.js';

export const publicRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // GET /prices — public price snapshot for all markets
  // -------------------------------------------------------------------------
  app.get('/prices', async (_request, reply) => {
    const prices = getLatestPrices();

    const data = prices.map((p) => ({
      market: p.market,
      price: p.price,
      confidence: p.confidence,
      timestamp: p.publishTime,
      change24h: p.change24h,
    }));

    return reply.status(200).send({ success: true, data });
  });

  // -------------------------------------------------------------------------
  // GET /markets — active market list (dynamic crypto + static forex/metals/indices)
  // -------------------------------------------------------------------------
  app.get('/markets', async (_request, reply) => {
    const crypto = getActiveMarketList();

    const forex = [
      'EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD', 'USD_CHF',
      'NZD_USD', 'EUR_GBP', 'EUR_JPY', 'GBP_JPY', 'EUR_CHF', 'AUD_JPY',
      'USD_MXN', 'USD_SGD',
    ];
    const metals = ['XAU', 'XAG'];
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM'];

    return reply.status(200).send({
      success: true,
      data: {
        crypto,
        forex,
        metals,
        indices,
        total: crypto.length + forex.length + metals.length + indices.length,
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /candles — OHLC candle data for any market
  // Query params: market (required), interval (default: 60), limit (default: 300)
  // Intervals: 1, 5, 15, 30, 60, 240, D
  // Crypto + gold: proxied from Bybit klines. Non-crypto: in-memory aggregation.
  // -------------------------------------------------------------------------
  app.get('/candles', async (request, reply) => {
    const query = request.query as { market?: string; interval?: string; limit?: string };
    const market = query.market?.toUpperCase();
    const intervalRaw = query.interval ?? '60';
    const limit = Math.min(1000, Math.max(1, parseInt(query.limit ?? '300', 10)));

    if (!market) {
      return reply.status(400).send({ success: false, error: 'market is required' });
    }

    if (!VALID_INTERVALS.includes(intervalRaw as CandleInterval)) {
      return reply.status(400).send({
        success: false,
        error: `interval must be one of: ${VALID_INTERVALS.join(', ')}`,
      });
    }

    const candles = await getCandles(market, intervalRaw as CandleInterval, limit);
    return reply.status(200).send({ success: true, data: candles });
  });

  // -------------------------------------------------------------------------
  // GET /vault/balance
  // -------------------------------------------------------------------------
  app.get('/vault/balance', async (_request, reply) => {
    const cacheKey = REDIS_KEYS.vaultBalance();
    const cached = await redis.get(cacheKey);

    if (cached) {
      return reply.status(200).send({ success: true, data: JSON.parse(cached) as unknown });
    }

    const balances = await getVaultBalance();
    await redis.setex(cacheKey, REDIS_VAULT_BALANCE_TTL_SECONDS, JSON.stringify(balances));

    return reply.status(200).send({ success: true, data: balances });
  });

  // -------------------------------------------------------------------------
  // GET /vault/next-payout
  // -------------------------------------------------------------------------
  app.get('/vault/next-payout', async (_request, reply) => {
    const repeatables = await payoutQueue.getRepeatableJobs();
    const nextMs = repeatables[0]?.next ?? null;
    const nextBatchAt = nextMs ? new Date(nextMs) : null;
    const hoursUntilBatch = nextBatchAt
      ? Math.max(0, (nextBatchAt.getTime() - Date.now()) / (1000 * 60 * 60))
      : 0;

    const [pendingCount, pendingSum] = await Promise.all([
      prisma.payoutRequest.count({ where: { status: 'PENDING' } }),
      prisma.payoutRequest.aggregate({
        where: { status: 'PENDING' },
        _sum: { amountUsd: true },
      }),
    ]);

    return reply.status(200).send({
      success: true,
      data: {
        nextBatchAt,
        hoursUntilBatch,
        pendingRequestCount: pendingCount,
        pendingAmountUsd: Number(pendingSum._sum.amountUsd ?? 0),
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /stats/overview
  // -------------------------------------------------------------------------
  app.get('/stats/overview', async (_request, reply) => {
    const [
      totalTraders,
      activeTraders,
      volumeAgg,
      payoutsAgg,
      totalAttempts,
      passedAttempts,
    ] = await Promise.all([
      prisma.trader.count(),
      prisma.trader.count({
        where: {
          attempts: {
            some: { status: 'ACTIVE' },
          },
        },
      }),
      // Total volume = sum of all attempt account sizes
      prisma.attempt.aggregate({ _sum: { accountSize: true } }),
      // Total paid out = sum of completed payout requests
      prisma.payoutRequest.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amountUsd: true },
      }),
      prisma.attempt.count({ where: { status: { in: ['PASSED', 'FAILED'] } } }),
      prisma.attempt.count({ where: { status: 'PASSED' } }),
    ]);

    // Vault balance is expensive — use cached value if available
    const cacheKey = REDIS_KEYS.vaultBalance();
    const cachedVault = await redis.get(cacheKey);
    let vaultBalance = 0;
    if (cachedVault) {
      const vaultData = JSON.parse(cachedVault) as Array<{ balanceUi: number }>;
      vaultBalance = vaultData.reduce((s, b) => s + (b.balanceUi ?? 0), 0);
    }

    const passRate = totalAttempts > 0 ? passedAttempts / totalAttempts : 0;

    return reply.status(200).send({
      success: true,
      data: {
        totalTraders,
        activeTraders,
        totalVolumeUsd: Number(volumeAgg._sum.accountSize ?? 0),
        totalPayoutsUsd: Number(payoutsAgg._sum.amountUsd ?? 0),
        vaultBalance,
        passRate,
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /leaderboard
  // -------------------------------------------------------------------------
  app.get('/leaderboard', async (request, reply) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10)));

    // Aggregate best P&L per trader from completed/passed attempts
    const traders = await prisma.trader.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        walletAddress: true,
        payoutRequests: {
          where: { status: 'COMPLETED' },
          select: { amountUsd: true },
        },
        attempts: {
          where: { status: { in: ['PASSED', 'FAILED', 'ACTIVE'] } },
          select: {
            status: true,
            startingBalance: true,
            currentBalance: true,
            attemptNumber: true,
          },
        },
        positions: {
          where: { status: 'CLOSED' },
          select: {
            realizedPnl: true,
          },
        },
      },
      take: limit * 3, // fetch extra to rank after aggregation
    });

    const rows = traders
      .map((t) => {
        const totalPayoutsUsd = t.payoutRequests.reduce(
          (s, r) => s + Number(r.amountUsd),
          0,
        );
        const passedAttempts = t.attempts.filter((a) => a.status === 'PASSED').length;
        const bestPnlPercent = t.attempts.reduce((best, a) => {
          const sb = Number(a.startingBalance);
          if (sb <= 0) return best;
          const pnl = ((Number(a.currentBalance) - sb) / sb) * 100;
          return pnl > best ? pnl : best;
        }, 0);

        // Compute totalPnlUsd: sum of (currentBalance - startingBalance) across passed/active attempts
        const totalPnlUsd = t.attempts.reduce((sum, a) => {
          return sum + (Number(a.currentBalance) - Number(a.startingBalance));
        }, 0);

        // Compute totalTrades: count of CLOSED positions
        const totalTrades = t.positions.length;

        // Compute winRate: count of profitable positions / total positions
        let winRate = 0;
        if (totalTrades > 0) {
          const profitableCount = t.positions.filter((p) => Number(p.realizedPnl ?? 0) > 0).length;
          winRate = profitableCount / totalTrades;
        }

        // Compute bestTradeUsd: max realizedPnl across all positions
        const bestTradeUsd = t.positions.length > 0
          ? Math.max(...t.positions.map((p) => Number(p.realizedPnl ?? 0)))
          : 0;

        // Compute status: if any attempt is ACTIVE, 'active'; if any is 'PASSED' and attemptNumber >= 3, 'funded'; else 'completed'
        let status: 'active' | 'funded' | 'completed' = 'completed';
        if (t.attempts.some((a) => a.status === 'ACTIVE')) {
          status = 'active';
        } else if (t.attempts.some((a) => a.status === 'PASSED' && a.attemptNumber >= 3)) {
          status = 'funded';
        }

        return {
          rank: 0, // filled in after sort
          traderId: t.id,
          walletAddress: t.walletAddress,
          bestPnlPercent: Math.round(bestPnlPercent * 100) / 100,
          totalPayoutsUsd,
          passedAttempts,
          totalPnlUsd,
          totalTrades,
          winRate,
          bestTradeUsd,
          status,
          // Sort key: weighted score
          _score: bestPnlPercent * 0.5 + totalPayoutsUsd * 0.003 + passedAttempts * 10,
        };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map((row, i) => ({
        rank: i + 1,
        traderId: row.traderId,
        walletAddress: row.walletAddress,
        bestPnlPercent: row.bestPnlPercent,
        totalPayoutsUsd: row.totalPayoutsUsd,
        passedAttempts: row.passedAttempts,
        totalPnlUsd: row.totalPnlUsd,
        totalTrades: row.totalTrades,
        winRate: row.winRate,
        bestTradeUsd: row.bestTradeUsd,
        status: row.status,
      }));

    return reply.status(200).send({ success: true, data: rows });
  });

  // -------------------------------------------------------------------------
  // GET /vault/status — vault fire countdown + stats (no auth)
  // -------------------------------------------------------------------------
  app.get('/vault/status', async (_request, reply) => {
    // Next fire time from BullMQ repeatable schedule
    const repeatables = await payoutQueue.getRepeatableJobs();
    const nextMs = repeatables[0]?.next ?? null;
    const nextFireAt = nextMs ? new Date(nextMs) : null;
    const hoursUntilFire = nextFireAt
      ? Math.max(0, (nextFireAt.getTime() - Date.now()) / (1000 * 60 * 60))
      : 0;

    // Last fire stats from Redis
    interface VaultFireStats {
      firedAt: string;
      tradersPaid: number;
      totalAmount: number;
      failed: number;
    }

    const lastFireRaw = await redis.get(REDIS_KEYS.vaultFireLast());
    let lastFireStats: VaultFireStats | null = null;

    if (lastFireRaw) {
      lastFireStats = JSON.parse(lastFireRaw) as VaultFireStats;
    }

    // Pending payouts
    const [pendingCount, pendingSum] = await Promise.all([
      prisma.payoutRequest.count({ where: { status: 'PENDING' } }),
      prisma.payoutRequest.aggregate({
        where: { status: 'PENDING' },
        _sum: { amountUsd: true },
      }),
    ]);

    // Vault balance (cached)
    const cacheKey = REDIS_KEYS.vaultBalance();
    const cachedVault = await redis.get(cacheKey);
    let vaultBalance = 0;
    if (cachedVault) {
      const vaultData = JSON.parse(cachedVault) as Array<{ balanceUi: number }>;
      vaultBalance = vaultData.reduce((s, b) => s + (b.balanceUi ?? 0), 0);
    }

    return reply.status(200).send({
      success: true,
      data: {
        nextFireAt,
        hoursUntilFire: Math.round(hoursUntilFire * 100) / 100,
        lastFireAt: lastFireStats?.firedAt ?? null,
        pendingPayouts: pendingCount,
        totalPendingAmount: Number(pendingSum._sum.amountUsd ?? 0),
        lastFireStats: lastFireStats
          ? {
              tradersPaid: lastFireStats.tradersPaid,
              totalAmount: lastFireStats.totalAmount,
            }
          : null,
        vaultBalance,
      },
    });
  });

  // -------------------------------------------------------------------------
  // POST /rpc — Solana RPC proxy (hides Helius API key from frontend)
  // -------------------------------------------------------------------------
  app.post('/rpc', async (request, reply) => {
    const body = request.body;
    const res = await fetch(config.solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return reply.send(data);
  });
};
