// =============================================================================
// Setl8 Backend — Payout Routes
//
// POST /request         submit a payout request for the active funded attempt
// GET  /                list my payout requests (all attempts)
// GET  /next-batch      when is the next batch + pending totals
// GET  /vault/balance   real-time payout vault token balances
// =============================================================================

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { MIN_PAYOUT_PERCENT, MAX_CUMULATIVE_PAYOUT_PERCENT, REDIS_KEYS, REDIS_VAULT_BALANCE_TTL_SECONDS } from '@setl8/constants';
import { verifyJWT } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { getVaultBalance } from '../../lib/solana.js';
import { payoutQueue } from '../../jobs/index.js';
import { serializeDecimals } from '../../lib/serialization.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const PayoutRequestSchema = z.object({
  amountUsd:   z.number().positive('Amount must be positive'),
  tokenSymbol: z.enum(['USDC', 'USDT', 'USD1']),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const payoutRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // POST /request — submit a payout request
  // -------------------------------------------------------------------------
  app.post('/request', { preHandler: [verifyJWT] }, async (request, reply) => {
    const parse = PayoutRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message ?? 'Invalid request body',
      });
    }

    const { amountUsd, tokenSymbol } = parse.data;
    const { traderId, walletAddress } = request.user;

    // Find the active funded attempt
    const attempt = await prisma.attempt.findFirst({
      where: { traderId, status: 'ACTIVE', phase: 'FUNDED' },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt) {
      return reply.status(400).send({
        success: false,
        error: 'No active funded attempt — payouts require a funded phase attempt',
        code: 'NOT_FUNDED',
      });
    }

    const accountSize = Number(attempt.accountSize);
    const totalPayoutTaken = Number(attempt.totalPayoutTaken);
    const realizedPnl = Number(attempt.realizedPnl);

    // Minimum payout check
    const minPayout = accountSize * MIN_PAYOUT_PERCENT;
    if (amountUsd < minPayout) {
      return reply.status(400).send({
        success: false,
        error: `Minimum payout is $${minPayout.toFixed(2)} (${(MIN_PAYOUT_PERCENT * 100).toFixed(0)}% of $${accountSize})`,
        code: 'BELOW_MINIMUM',
      });
    }

    // Cumulative maximum check
    const maxCumulative = accountSize * MAX_CUMULATIVE_PAYOUT_PERCENT;
    if (totalPayoutTaken + amountUsd > maxCumulative) {
      const remaining = maxCumulative - totalPayoutTaken;
      return reply.status(400).send({
        success: false,
        error: `Maximum cumulative payout is $${maxCumulative.toFixed(2)}. You have $${remaining.toFixed(2)} remaining.`,
        code: 'EXCEEDS_MAXIMUM',
      });
    }

    // Cannot withdraw more than available realized profit
    const availableProfit = realizedPnl - totalPayoutTaken;
    if (amountUsd > availableProfit) {
      return reply.status(400).send({
        success: false,
        error: `Available realized profit is $${availableProfit.toFixed(2)}`,
        code: 'INSUFFICIENT_PROFIT',
      });
    }

    // No open positions allowed when requesting payout
    const openPositionCount = await prisma.position.count({
      where: { attemptId: attempt.id, status: 'OPEN' },
    });
    if (openPositionCount > 0) {
      return reply.status(400).send({
        success: false,
        error: 'Close all open positions before requesting a payout',
        code: 'OPEN_POSITIONS',
      });
    }

    // Create the payout request
    const payoutRequest = await prisma.payoutRequest.create({
      data: {
        traderId,
        attemptId: attempt.id,
        walletAddress,
        amountUsd,
        tokenSymbol,
        status: 'PENDING',
      },
    });

    request.log.info({ traderId, amountUsd, tokenSymbol }, 'Payout request submitted');

    return reply.status(201).send({ success: true, data: serializeDecimals(payoutRequest) });
  });

  // -------------------------------------------------------------------------
  // GET / — list all my payout requests
  // -------------------------------------------------------------------------
  app.get('/', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10)));

    const [items, total] = await Promise.all([
      prisma.payoutRequest.findMany({
        where: { traderId },
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.payoutRequest.count({ where: { traderId } }),
    ]);

    return reply.status(200).send({
      success: true,
      data: { items: serializeDecimals(items), total, page, pageSize, hasMore: page * pageSize < total },
    });
  });

  // -------------------------------------------------------------------------
  // GET /next-batch — next payout batch timing + pending totals
  // -------------------------------------------------------------------------
  app.get('/next-batch', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;

    // Get next repeatable job schedule from BullMQ
    const repeatables = await payoutQueue.getRepeatableJobs();
    const nextMs = repeatables[0]?.next ?? null;
    const nextBatchAt = nextMs ? new Date(nextMs) : null;
    const hoursUntilBatch = nextBatchAt
      ? Math.max(0, (nextBatchAt.getTime() - Date.now()) / (1000 * 60 * 60))
      : 0;

    const [pendingCount, pendingSum] = await Promise.all([
      prisma.payoutRequest.count({ where: { traderId, status: 'PENDING' } }),
      prisma.payoutRequest.aggregate({
        where: { traderId, status: 'PENDING' },
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
  // GET /vault/balance — real-time vault token balances (Redis-cached 30 s)
  // -------------------------------------------------------------------------
  app.get('/vault/balance', async (_request, reply) => {
    const cacheKey = REDIS_KEYS.vaultBalance();
    const cached = await redis.get(cacheKey);

    if (cached) {
      return reply.status(200).send({ success: true, data: JSON.parse(cached) });
    }

    const balances = await getVaultBalance();
    await redis.setex(cacheKey, REDIS_VAULT_BALANCE_TTL_SECONDS, JSON.stringify(balances));

    return reply.status(200).send({ success: true, data: balances });
  });
};
