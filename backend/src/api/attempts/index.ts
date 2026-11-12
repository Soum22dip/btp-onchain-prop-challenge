// =============================================================================
// Setl8 Backend — Attempt Routes
//
// POST /          purchase an evaluation and create a new attempt
// GET  /          list all my attempts
// GET  /:id       get attempt detail with position summary
// =============================================================================

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { EVALUATION_PACKAGES } from '@setl8/constants';
import { verifyJWT } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { connection } from '../../lib/solana.js';
import { serializeDecimals } from '../../lib/serialization.js';
import { logger } from '../../lib/logger.js';
import { sendTraderAlert } from '../../telegram/alerts.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_ACCOUNT_SIZES = new Set(EVALUATION_PACKAGES.map((p) => p.accountSize));

const CreateAttemptSchema = z.object({
  txSignature: z
    .string()
    .min(87, 'Invalid transaction signature')
    .max(88, 'Invalid transaction signature'),
  accountSizeUsd: z
    .number()
    .refine((v) => VALID_ACCOUNT_SIZES.has(v), {
      message: `Account size must be one of: ${[...VALID_ACCOUNT_SIZES].join(', ')}`,
    }),
  tokenSymbol: z.enum(['USDC', 'USDT', 'USD1']),
});

const AttemptIdParamSchema = z.object({
  id: z.string().uuid('Invalid attempt ID'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 6;
const TX_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 hours

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verify a deposit transaction on-chain.
 * Retries up to 10 times (2s apart) because the frontend calls immediately
 * after sendRawTransaction — the tx may not be indexed yet.
 */
async function verifyDepositTx(txSignature: string): Promise<void> {
  const MAX_RETRIES = 10;
  const RETRY_DELAY_MS = 2_000;

  let tx = null;
  for (let i = 0; i < MAX_RETRIES; i++) {
    tx = await connection.getTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    if (tx) break;
    if (i < MAX_RETRIES - 1) await sleep(RETRY_DELAY_MS);
  }

  if (!tx) {
    throw Object.assign(
      new Error('Transaction not found after waiting — it may still be processing. Contact support if this persists.'),
      { code: 'TX_NOT_FOUND' },
    );
  }

  if (tx.meta?.err) {
    throw Object.assign(
      new Error('Transaction failed on-chain — cannot use a failed transaction'),
      { code: 'TX_FAILED' },
    );
  }

  const blockTime = tx.blockTime ?? 0;
  const ageSeconds = Date.now() / 1000 - blockTime;
  if (ageSeconds > TX_MAX_AGE_SECONDS) {
    throw Object.assign(
      new Error('Transaction is too old — must be within the last 24 hours'),
      { code: 'TX_TOO_OLD' },
    );
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const attemptsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // POST / — create a new attempt
  // -------------------------------------------------------------------------
  app.post('/', { preHandler: [verifyJWT] }, async (request, reply) => {
    const parse = CreateAttemptSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message ?? 'Invalid request body',
      });
    }

    const { txSignature, accountSizeUsd, tokenSymbol } = parse.data;
    const { traderId } = request.user;

    // Check trader is not banned
    const trader = await prisma.trader.findUnique({
      where: { id: traderId },
      select: { status: true },
    });
    if (!trader || trader.status === 'BANNED' || trader.status === 'SUSPENDED') {
      return reply.status(403).send({ success: false, error: 'Account is banned or suspended' });
    }

    // Check for an already-active attempt
    const activeAttempt = await prisma.attempt.findFirst({
      where: { traderId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (activeAttempt) {
      return reply.status(400).send({
        success: false,
        error: 'You already have an active attempt',
        code: 'ACTIVE_ATTEMPT_EXISTS',
      });
    }

    // Count total attempts (PASSED or FAILED) for attempt number
    const completedCount = await prisma.attempt.count({
      where: { traderId, status: { in: ['PASSED', 'FAILED'] } },
    });
    const attemptNumber = completedCount + 1;

    if (attemptNumber > MAX_ATTEMPTS) {
      return reply.status(400).send({
        success: false,
        error: `Maximum of ${MAX_ATTEMPTS} attempts per account reached`,
        code: 'MAX_ATTEMPTS_REACHED',
      });
    }

    // Count only PASSED attempts to determine phase
    const passedCount = await prisma.attempt.count({
      where: { traderId, status: 'PASSED' },
    });

    // Verify the txSignature is not already in use
    const existingAttempt = await prisma.attempt.findFirst({
      where: { txSignature },
      select: { id: true },
    });
    if (existingAttempt) {
      return reply.status(400).send({
        success: false,
        error: 'This transaction has already been used to create an attempt',
        code: 'TX_ALREADY_USED',
      });
    }

    // Calculate attempt fields
    const startingBalance = accountSizeUsd;
    const profitTarget = startingBalance * 1.08;
    const maxDrawdownFloor = startingBalance * 0.92;
    // Phase based on passed attempts: 0 passed = EVALUATION, 1+ passed = FUNDED
    const phase = passedCount >= 1 ? 'FUNDED' : 'EVALUATION';

    // Create the attempt IMMEDIATELY — don't block on tx verification
    const attempt = await prisma.attempt.create({
      data: {
        traderId,
        attemptNumber,
        phase,
        status: 'ACTIVE',
        accountSize: startingBalance,
        startingBalance,
        currentBalance: startingBalance,
        peakBalance: startingBalance,
        profitTarget,
        maxDrawdownFloor,
        realizedPnl: 0,
        unrealizedPnl: 0,
        totalPayoutTaken: 0,
        tokenUsed: tokenSymbol,
        txSignature,
        startedAt: new Date(),
      },
    });

    request.log.info(
      { traderId, attemptId: attempt.id, attemptNumber, accountSizeUsd, txSignature },
      'Attempt created — verifying tx in background',
    );

    // Telegram alert — new phase started (non-blocking)
    sendTraderAlert(traderId, {
      type: 'new_phase',
      phase,
      attemptNumber,
      accountSize: accountSizeUsd,
    }).catch(() => {});

    // Verify the Solana transaction in the background (non-blocking)
    // If verification fails, log it for admin review — don't block the trader
    verifyDepositTx(txSignature)
      .then(() => {
        logger.info({ attemptId: attempt.id, txSignature }, 'Deposit tx verified on-chain');
      })
      .catch((err) => {
        logger.error(
          { attemptId: attempt.id, txSignature, err: (err as Error).message },
          'Deposit tx verification failed — requires admin review',
        );
      });

    return reply.status(201).send({ success: true, data: serializeDecimals(attempt) });
  });

  // -------------------------------------------------------------------------
  // GET / — list all attempts for the trader
  // -------------------------------------------------------------------------
  app.get('/', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(query.pageSize ?? '10', 10)));

    const [items, total] = await Promise.all([
      prisma.attempt.findMany({
        where: { traderId },
        orderBy: { attemptNumber: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: {
              positions: { where: { status: 'OPEN' } },
            },
          },
        },
      }),
      prisma.attempt.count({ where: { traderId } }),
    ]);

    return reply.status(200).send({
      success: true,
      data: { items: serializeDecimals(items), total, page, pageSize, hasMore: page * pageSize < total },
    });
  });

  // -------------------------------------------------------------------------
  // GET /chains — grouped attempt data
  // -------------------------------------------------------------------------
  app.get('/chains', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;

    const attempts = await prisma.attempt.findMany({
      where: { traderId },
      orderBy: { attemptNumber: 'asc' },
      include: {
        _count: {
          select: {
            positions: true,
          },
        },
        payoutRequests: {
          where: { status: { in: ['COMPLETED', 'PENDING', 'PROCESSING'] } },
          select: { amountUsd: true, status: true },
        },
      },
    });

    // Group into chains: a new chain starts at each EVALUATION phase
    const chains: Array<{
      chainNumber: number;
      phases: typeof attempts;
    }> = [];

    let currentChain: typeof attempts = [];

    for (const attempt of attempts) {
      if (attempt.phase === 'EVALUATION' && currentChain.length > 0) {
        chains.push({ chainNumber: chains.length + 1, phases: currentChain });
        currentChain = [];
      }
      currentChain.push(attempt);
    }
    if (currentChain.length > 0) {
      chains.push({ chainNumber: chains.length + 1, phases: currentChain });
    }

    // Build response
    let fundedIndex = 0;
    const formatPhase = (att: typeof attempts[0]) => {
      let phaseLabel: string;
      if (att.phase === 'EVALUATION') {
        phaseLabel = 'Evaluation';
        fundedIndex = 0; // reset for new chain
      } else {
        fundedIndex++;
        phaseLabel = `Funded #${fundedIndex}`;
      }

      const startBal = Number(att.startingBalance);
      const currentBal = Number(att.currentBalance);
      const pnlPct = startBal > 0 ? ((currentBal - startBal) / startBal) * 100 : 0;
      const totalPayouts = att.payoutRequests.reduce((sum, p) => sum + Number(p.amountUsd), 0);

      return {
        id: att.id,
        attemptNumber: att.attemptNumber,
        phase: att.phase,
        phaseLabel,
        status: att.status,
        startingBalance: startBal,
        currentBalance: currentBal,
        pnlPercent: pnlPct,
        startedAt: att.startedAt,
        endedAt: att.endedAt,
        tradeCount: att._count.positions,
        totalPayouts,
      };
    };

    const result = chains.map((chain) => {
      fundedIndex = 0; // reset per chain
      const phases = chain.phases.map(formatPhase);
      const hasActive = phases.some((p) => p.status === 'ACTIVE');
      const failed = phases.find((p) => p.status === 'FAILED');
      const totalPnl = phases.reduce((sum, p) => sum + (p.currentBalance - p.startingBalance), 0);
      const totalPayouts = phases.reduce((sum, p) => sum + p.totalPayouts, 0);

      return {
        chainNumber: chain.chainNumber,
        phases,
        isActive: hasActive,
        totalPnl,
        totalPayouts,
        startedAt: phases[0].startedAt,
        endedAt: phases[phases.length - 1]?.endedAt ?? null,
        failedAtPhase: failed?.phaseLabel ?? null,
      };
    });

    // Separate active vs past
    const current = result.find((c) => c.isActive) ?? null;
    const past = result.filter((c) => !c.isActive).reverse(); // most recent first

    return reply.status(200).send({
      success: true,
      data: { current, past },
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id — attempt detail with snapshots
  // -------------------------------------------------------------------------
  app.get('/:id', { preHandler: [verifyJWT] }, async (request, reply) => {
    const parse = AttemptIdParamSchema.safeParse(request.params);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: 'Invalid attempt ID' });
    }

    const { traderId } = request.user;

    const attempt = await prisma.attempt.findUnique({
      where: { id: parse.data.id },
      include: {
        snapshots: {
          orderBy: { snapshotAt: 'asc' },
          take: 90, // last 30 days at 3 snapshots/day
        },
        positions: {
          where: { status: 'OPEN' },
          orderBy: { openedAt: 'desc' },
        },
        _count: {
          select: {
            positions: true,
            payoutRequests: { where: { status: 'COMPLETED' } },
          },
        },
      },
    });

    if (!attempt) {
      return reply.status(404).send({ success: false, error: 'Attempt not found' });
    }

    if (attempt.traderId !== traderId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    return reply.status(200).send({ success: true, data: serializeDecimals(attempt) });
  });
};
