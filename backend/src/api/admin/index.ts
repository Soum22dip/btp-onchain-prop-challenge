// =============================================================================
// Setl8 Backend — Admin Routes (X-Admin-Secret required on all routes)
//
// GET  /traders              paginated list of all traders with their stats
// POST /trader/ban           ban or suspend a trader
// GET  /payout/queue         all pending payout requests
// POST /payout/process       manually trigger a payout batch now
// GET  /fraud/flagged        traders who have fraud flags on their account
// =============================================================================

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { verifyAdmin } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { processPayoutBatch } from '../../jobs/payout.job.js';
import { serializeDecimals } from '../../lib/serialization.js';
import { EVALUATION_PACKAGES, MARKET_CATEGORY, type MarketCategory } from '@setl8/constants';
import { Market } from '@setl8/types';
import { getLatestPrices } from '../../lib/pyth.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const BanTraderSchema = z.object({
  traderId: z.string().uuid('Invalid trader ID'),
  action:   z.enum(['BAN', 'SUSPEND', 'UNBAN']),
  reason:   z.string().min(1, 'Reason is required'),
});

const PaginationSchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// Price lookup: account size → fee in USD
const PRICE_BY_SIZE = new Map(
  EVALUATION_PACKAGES.map((p) => [p.accountSize, p.priceCents / 100]),
);

export const adminRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // GET /overview — admin dashboard overview stats
  // -------------------------------------------------------------------------
  app.get('/overview', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Trader counts
    const [totalTraders, activeTraders] = await Promise.all([
      prisma.trader.count(),
      prisma.trader.count({ where: { status: 'ACTIVE' } }),
    ]);

    // All evaluation attempts (each = 1 challenge sold)
    const evalAttempts = await prisma.attempt.findMany({
      where: { phase: 'EVALUATION' },
      select: { startingBalance: true, startedAt: true, status: true },
    });

    // Revenue from eval fees
    let totalRevenue = 0;
    let revenueToday = 0;
    let revenueThisWeek = 0;
    let revenueThisMonth = 0;
    let passedEvals = 0;
    let completedEvals = 0;

    for (const att of evalAttempts) {
      const price = PRICE_BY_SIZE.get(Number(att.startingBalance)) ?? 0;
      totalRevenue += price;
      if (att.startedAt >= todayStart) revenueToday += price;
      if (att.startedAt >= weekAgo) revenueThisWeek += price;
      if (att.startedAt >= monthAgo) revenueThisMonth += price;
      if (att.status === 'PASSED') passedEvals++;
      if (att.status === 'PASSED' || att.status === 'FAILED') completedEvals++;
    }

    const evalPassRate = completedEvals > 0 ? passedEvals / completedEvals : 0;

    // Funded pass rate
    const fundedAttempts = await prisma.attempt.findMany({
      where: { phase: 'FUNDED' },
      select: { status: true },
    });
    const passedFunded = fundedAttempts.filter((a) => a.status === 'PASSED').length;
    const completedFunded = fundedAttempts.filter((a) =>
      a.status === 'PASSED' || a.status === 'FAILED',
    ).length;
    const fundedPassRate = completedFunded > 0 ? passedFunded / completedFunded : 0;

    // Active challenges + funded accounts
    const [activeChallenges, activeFundedAccounts] = await Promise.all([
      prisma.attempt.count({ where: { status: 'ACTIVE' } }),
      prisma.attempt.count({ where: { status: 'ACTIVE', phase: 'FUNDED' } }),
    ]);

    // Payouts
    const [completedPayouts, pendingPayouts] = await Promise.all([
      prisma.payoutRequest.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.payoutRequest.aggregate({
        where: { status: 'PENDING' },
        _sum: { amountUsd: true },
        _count: true,
      }),
    ]);

    // Vault balance (read from public stats if available, otherwise 0)
    // The vault balance is fetched on-chain by the public /api/stats/overview endpoint
    // For admin, we just report the payout-related numbers
    const totalPayoutsUsd = Number(completedPayouts._sum.amountUsd ?? 0);

    // Next vault fire date (every 14 days from epoch)
    const epochMs = new Date('2026-01-01T00:00:00Z').getTime();
    const intervalMs = 14 * 24 * 60 * 60 * 1000;
    const cyclesSinceEpoch = Math.ceil((now.getTime() - epochMs) / intervalMs);
    const nextVaultFireAt = new Date(epochMs + cyclesSinceEpoch * intervalMs).toISOString();

    return reply.status(200).send({
      success: true,
      data: {
        totalTraders,
        activeTraders,
        totalVolumeUsd: totalRevenue,
        totalPayoutsUsd,
        vaultBalance: 0, // fetched client-side from public endpoint
        passRate: evalPassRate,
        pendingPayoutsUsd: Number(pendingPayouts._sum.amountUsd ?? 0),
        pendingPayoutCount: pendingPayouts._count,
        challengesSold: evalAttempts.length,
        challengeRevenue: totalRevenue,
        activeFundedAccounts,
        nextVaultFireAt,
        revenueToday,
        revenueThisWeek,
        revenueThisMonth,
        passRatePhase1: evalPassRate,
        passRatePhase2: null,
        passRateFunded: fundedPassRate > 0 ? fundedPassRate : null,
        activeChallenges,
        soldToday: evalAttempts.filter((a) => a.startedAt >= todayStart).length,
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /vault/health — vault inflows, outflows, coverage ratio
  // -------------------------------------------------------------------------
  app.get('/vault/health', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    // Total inflows: 65% of all challenge fees go to vault
    const evalAttempts = await prisma.attempt.findMany({
      where: { phase: 'EVALUATION' },
      select: { startingBalance: true },
    });

    let totalFees = 0;
    for (const att of evalAttempts) {
      totalFees += PRICE_BY_SIZE.get(Number(att.startingBalance)) ?? 0;
    }
    const totalInflow = totalFees * 0.65;

    // Total outflows: completed payouts
    const outflowAgg = await prisma.payoutRequest.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { amountUsd: true },
    });
    const totalOutflow = Number(outflowAgg._sum.amountUsd ?? 0);

    // Pending/expected payouts
    const pendingAgg = await prisma.payoutRequest.aggregate({
      where: { status: { in: ['PENDING', 'PROCESSING', 'APPROVED'] } },
      _sum: { amountUsd: true },
    });
    const expectedPayouts = Number(pendingAgg._sum.amountUsd ?? 0);

    // Estimated vault balance and coverage
    const currentBalance = totalInflow - totalOutflow;
    const netChange = totalInflow - totalOutflow - expectedPayouts;
    const coverageRatio = expectedPayouts > 0
      ? Math.min(Number((currentBalance / expectedPayouts).toFixed(2)), 999)
      : 0;

    return reply.status(200).send({
      success: true,
      data: {
        currentBalance,
        totalInflow,
        totalOutflow,
        netChange,
        coverageRatio,
        expectedPayouts,
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /market/status — price feed health for all markets
  // -------------------------------------------------------------------------
  app.get('/market/status', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    const prices = getLatestPrices();
    const now = Date.now();
    const STALE_THRESHOLD_MS = 30_000;

    // Derive source from market category
    const sourceForCategory: Record<MarketCategory, string> = {
      CRYPTO: 'Bybit',
      METALS: 'Bybit',
      INDICES: 'Finnhub',
      FOREX: 'Finnhub',
    };

    const feeds = prices.map((p) => {
      const category = MARKET_CATEGORY[p.market as Market] ?? 'CRYPTO';
      const staleSinceMs = now - p.publishTime;
      return {
        symbol: p.market,
        category,
        lastPrice: p.price,
        lastUpdated: new Date(p.publishTime).toISOString(),
        source: sourceForCategory[category],
        isStale: staleSinceMs > STALE_THRESHOLD_MS,
        staleSinceMs,
      };
    });

    feeds.sort((a, b) => a.symbol.localeCompare(b.symbol));

    const staleCount = feeds.filter((f) => f.isStale).length;
    const categoryCounts: Record<string, number> = {};
    for (const f of feeds) {
      categoryCounts[f.category] = (categoryCounts[f.category] ?? 0) + 1;
    }

    // Derive connection status: if any feed from that source is fresh, it's connected
    const bybitConnected = feeds.some((f) => f.source === 'Bybit' && !f.isStale);
    const finnhubConnected = feeds.some((f) => f.source === 'Finnhub' && !f.isStale);

    return reply.status(200).send({
      success: true,
      data: {
        feeds,
        bybitConnected,
        finnhubConnected,
        totalMarkets: feeds.length,
        staleCount,
        categoryCounts,
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /sales — all challenge purchases (every EVALUATION attempt = 1 sale)
  // -------------------------------------------------------------------------
  app.get('/sales', { preHandler: [verifyAdmin] }, async (request, reply) => {
    const parse = PaginationSchema.safeParse(request.query);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: 'Invalid pagination params' });
    }

    const { page, pageSize } = parse.data;

    const [items, total] = await Promise.all([
      prisma.attempt.findMany({
        where: { phase: 'EVALUATION' },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          trader: { select: { id: true, walletAddress: true } },
        },
      }),
      prisma.attempt.count({ where: { phase: 'EVALUATION' } }),
    ]);

    // Build revenue by tier
    const allEvals = await prisma.attempt.findMany({
      where: { phase: 'EVALUATION' },
      select: { startingBalance: true },
    });

    const revenueByTier: Record<string, { count: number; revenue: number }> = {};
    let totalRevenueUsd = 0;

    for (const att of allEvals) {
      const size = Number(att.startingBalance);
      const price = PRICE_BY_SIZE.get(size) ?? 0;
      totalRevenueUsd += price;
      const key = String(size);
      if (!revenueByTier[key]) {
        revenueByTier[key] = { count: 0, revenue: 0 };
      }
      revenueByTier[key].count++;
      revenueByTier[key].revenue += price;
    }

    const sales = items.map((att) => {
      const size = Number(att.startingBalance);
      return {
        id: att.id,
        traderId: att.trader.id,
        walletAddress: att.trader.walletAddress,
        accountSize: size,
        priceUsd: PRICE_BY_SIZE.get(size) ?? 0,
        tokenSymbol: att.tokenUsed,
        txHash: att.txSignature,
        purchasedAt: att.startedAt.toISOString(),
      };
    });

    return reply.status(200).send({
      success: true,
      data: {
        items: sales,
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
        totalRevenueUsd,
        revenueByTier,
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /traders — paginated trader list with attempt + payout summaries
  // -------------------------------------------------------------------------
  app.get('/traders', { preHandler: [verifyAdmin] }, async (request, reply) => {
    const parse = PaginationSchema.safeParse(request.query);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: 'Invalid pagination params' });
    }

    const { page, pageSize } = parse.data;

    const [items, total] = await Promise.all([
      prisma.trader.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { attempts: true, payoutRequests: true } },
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
      }),
      prisma.trader.count(),
    ]);

    const data = items.map((t) => ({
      id: t.id,
      walletAddress: t.walletAddress,
      status: t.status,
      fraudFlags: t.fraudFlags,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      totalAttempts: t._count.attempts,
      activeAttemptId: t.attempts[0]?.id ?? null,
      totalPayoutsUsd: t.payoutRequests.reduce((s, r) => s + Number(r.amountUsd), 0),
    }));

    return reply.status(200).send({
      success: true,
      data: { items: serializeDecimals(data), total, page, pageSize, hasMore: page * pageSize < total },
    });
  });

  // -------------------------------------------------------------------------
  // GET /traders/:id — detailed trader view with attempts + payouts
  // -------------------------------------------------------------------------
  app.get('/traders/:id', { preHandler: [verifyAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const trader = await prisma.trader.findUnique({
      where: { id },
      include: {
        attempts: {
          orderBy: { attemptNumber: 'asc' },
          include: {
            _count: { select: { positions: true } },
          },
        },
        payoutRequests: {
          orderBy: { requestedAt: 'desc' },
          include: {
            attempt: { select: { attemptNumber: true, accountSize: true } },
          },
        },
      },
    });

    if (!trader) {
      return reply.status(404).send({ success: false, error: 'Trader not found' });
    }

    const activeAttempt = trader.attempts.find((a) => a.status === 'ACTIVE');
    const totalPayoutsUsd = trader.payoutRequests
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + Number(p.amountUsd), 0);

    const attempts = trader.attempts.map((a) => {
      const startBal = Number(a.startingBalance);
      const currentBal = Number(a.currentBalance);
      const pnlUsd = currentBal - startBal;
      return {
        id: a.id,
        attemptNumber: a.attemptNumber,
        accountSize: Number(a.accountSize),
        status: a.status,
        pnlUsd,
        pnlPercent: startBal > 0 ? (pnlUsd / startBal) * 100 : 0,
        startedAt: a.startedAt.toISOString(),
        endedAt: a.endedAt?.toISOString() ?? null,
        positionsCount: a._count.positions,
      };
    });

    const payoutHistory = trader.payoutRequests.map((p) => ({
      id: p.id,
      traderId: p.traderId,
      attemptId: p.attemptId,
      amountUsd: Number(p.amountUsd),
      tokenSymbol: p.tokenSymbol,
      status: p.status,
      requestedAt: p.requestedAt.toISOString(),
      processedAt: p.processedAt?.toISOString() ?? undefined,
      txHash: p.onchainTxSignature ?? undefined,
      trader: { walletAddress: trader.walletAddress },
      attempt: {
        attemptNumber: p.attempt.attemptNumber,
        accountSize: Number(p.attempt.accountSize),
      },
    }));

    return reply.status(200).send({
      success: true,
      data: {
        id: trader.id,
        walletAddress: trader.walletAddress,
        status: trader.status,
        fraudFlags: trader.fraudFlags,
        createdAt: trader.createdAt.toISOString(),
        updatedAt: trader.updatedAt.toISOString(),
        totalAttempts: trader.attempts.length,
        activeAttemptId: activeAttempt?.id ?? null,
        totalPayoutsUsd,
        attempts,
        payoutHistory,
      },
    });
  });

  // -------------------------------------------------------------------------
  // POST /trader/ban — ban, suspend, or unban a trader
  // -------------------------------------------------------------------------
  app.post('/trader/ban', { preHandler: [verifyAdmin] }, async (request, reply) => {
    const parse = BanTraderSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message ?? 'Invalid request body',
      });
    }

    const { traderId, action, reason } = parse.data;

    const trader = await prisma.trader.findUnique({
      where: { id: traderId },
      select: { id: true, status: true },
    });

    if (!trader) {
      return reply.status(404).send({ success: false, error: 'Trader not found' });
    }

    const newStatus =
      action === 'BAN'     ? 'BANNED' :
      action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';

    await prisma.$transaction(async (tx) => {
      await tx.trader.update({
        where: { id: traderId },
        data: { status: newStatus },
      });

      if (action === 'BAN' || action === 'SUSPEND') {
        // Force-close the active attempt if any
        await tx.attempt.updateMany({
          where: { traderId, status: 'ACTIVE' },
          data: { status: 'ABANDONED', endedAt: new Date() },
        });

        // Force-close all open positions
        await tx.position.updateMany({
          where: { traderId, status: 'OPEN' },
          data: { status: 'CLOSED', closedAt: new Date() },
        });
      }
    });

    request.log.warn({ traderId, action, reason }, 'Admin trader status change');

    return reply.status(200).send({
      success: true,
      data: { traderId, newStatus, reason },
    });
  });

  // -------------------------------------------------------------------------
  // GET /payout/queue — all pending payout requests
  // -------------------------------------------------------------------------
  app.get('/payout/queue', { preHandler: [verifyAdmin] }, async (request, reply) => {
    const parse = PaginationSchema.safeParse(request.query);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: 'Invalid pagination params' });
    }

    const { page, pageSize } = parse.data;

    const [items, total] = await Promise.all([
      prisma.payoutRequest.findMany({
        where: { status: 'PENDING' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { requestedAt: 'asc' },
        include: {
          trader: { select: { walletAddress: true } },
          attempt: { select: { attemptNumber: true, accountSize: true } },
        },
      }),
      prisma.payoutRequest.count({ where: { status: 'PENDING' } }),
    ]);

    const totalPendingUsd = await prisma.payoutRequest.aggregate({
      where: { status: 'PENDING' },
      _sum: { amountUsd: true },
    });

    return reply.status(200).send({
      success: true,
      data: {
        items: serializeDecimals(items),
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
        totalPendingUsd: Number(totalPendingUsd._sum.amountUsd ?? 0),
      },
    });
  });

  // -------------------------------------------------------------------------
  // POST /payout/process — manually trigger a payout batch immediately
  // -------------------------------------------------------------------------
  app.post('/payout/process', { preHandler: [verifyAdmin] }, async (request, reply) => {
    const pendingCount = await prisma.payoutRequest.count({ where: { status: 'PENDING' } });

    if (pendingCount === 0) {
      return reply.status(200).send({
        success: true,
        data: { message: 'No pending requests — nothing to process' },
      });
    }

    // Run synchronously so the admin gets an immediate result
    try {
      await processPayoutBatch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: `Batch processing failed: ${message}` });
    }

    request.log.info({ processedCount: pendingCount }, 'Admin triggered payout batch');

    return reply.status(200).send({
      success: true,
      data: { message: `Payout batch processed. Attempted ${pendingCount} request(s).` },
    });
  });

  // -------------------------------------------------------------------------
  // GET /payouts — all payouts across all traders (with status filter)
  // -------------------------------------------------------------------------
  app.get('/payouts', { preHandler: [verifyAdmin] }, async (request, reply) => {
    const query = request.query as { page?: string; pageSize?: string; status?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10)));

    const statusFilter = query.status?.toUpperCase();
    const validStatuses = ['PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED'];
    const where = statusFilter && validStatuses.includes(statusFilter)
      ? { status: statusFilter as 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' }
      : {};

    const [items, total, pendingAgg, completedAgg] = await Promise.all([
      prisma.payoutRequest.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { requestedAt: 'desc' },
        include: {
          trader: { select: { walletAddress: true } },
          attempt: { select: { attemptNumber: true, accountSize: true, phase: true } },
        },
      }),
      prisma.payoutRequest.count({ where }),
      prisma.payoutRequest.aggregate({
        where: { status: 'PENDING' },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.payoutRequest.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amountUsd: true },
        _count: true,
      }),
    ]);

    return reply.status(200).send({
      success: true,
      data: {
        items: serializeDecimals(items),
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
        summary: {
          totalPending: pendingAgg._count,
          totalPendingUsd: Number(pendingAgg._sum.amountUsd ?? 0),
          totalCompleted: completedAgg._count,
          totalPaidUsd: Number(completedAgg._sum.amountUsd ?? 0),
        },
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /fraud/flagged — traders with fraud flags
  // -------------------------------------------------------------------------
  app.get('/fraud/flagged', { preHandler: [verifyAdmin] }, async (request, reply) => {
    const parse = PaginationSchema.safeParse(request.query);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: 'Invalid pagination params' });
    }

    const { page, pageSize } = parse.data;

    const [items, total] = await Promise.all([
      prisma.trader.findMany({
        where: { fraudFlags: { isEmpty: false } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          walletAddress: true,
          status: true,
          fraudFlags: true,
          updatedAt: true,
          fraudFlagRecords: {
            orderBy: { flaggedAt: 'desc' },
            take: 10,
            select: { flag: true, notes: true, flaggedAt: true, flaggedBy: true },
          },
        },
      }),
      prisma.trader.count({ where: { fraudFlags: { isEmpty: false } } }),
    ]);

    return reply.status(200).send({
      success: true,
      data: { items, total, page, pageSize, hasMore: page * pageSize < total },
    });
  });

  // -------------------------------------------------------------------------
  // POST /pause-payouts — toggle global payout pause
  // -------------------------------------------------------------------------
  app.post('/pause-payouts', { preHandler: [verifyAdmin] }, async (request, reply) => {
    const parsed = z.object({ paused: z.boolean() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Body must be { paused: boolean }' });
    }

    const { paused } = parsed.data;
    await redis.set('platform:payouts_paused', String(paused));
    request.log.info({ paused }, '[admin] Global payout pause toggled');

    return reply.status(200).send({
      success: true,
      paused,
      message: paused
        ? 'Payouts paused'
        : 'Payouts unpaused — heartbeat will fire on next cycle',
    });
  });

  // -------------------------------------------------------------------------
  // GET /pause-status — read current pause flag
  // -------------------------------------------------------------------------
  app.get('/pause-status', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    const value = await redis.get('platform:payouts_paused');
    return reply.status(200).send({ success: true, paused: value === 'true' });
  });
};
