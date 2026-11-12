// =============================================================================
// Setl8 Backend — Dev Helper Routes (development only)
//
// POST /create-challenge   create a test challenge for any wallet
// POST /simulate-pass      instantly pass a trader's active attempt
// POST /fire-vault         manually trigger a vault fire (no auth)
// =============================================================================

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { EVALUATION_PACKAGES, FIRST_FUNDED_ATTEMPT } from '@setl8/constants';
import { prisma } from '../../lib/prisma.js';
import { createPassPayout } from '../../services/payout.js';
import { processPayoutBatch } from '../../jobs/payout.job.js';
import { forceCloseTraderAccount } from '../../lib/solana.js';
import { logger } from '../../lib/logger.js';

const VALID_ACCOUNT_SIZES = new Set(EVALUATION_PACKAGES.map((p) => p.accountSize));

const CreateChallengeSchema = z.object({
  walletAddress: z.string().min(32).max(44),
  accountSize: z.number().refine((v) => VALID_ACCOUNT_SIZES.has(v), {
    message: `Account size must be one of: ${[...VALID_ACCOUNT_SIZES].join(', ')}`,
  }),
  attemptNumber: z.number().int().min(1).max(7).optional(),
});

const SimulatePassSchema = z.object({
  walletAddress: z.string().min(32).max(44),
});

const CloseTraderAccountSchema = z.object({
  wallet: z.string().min(32).max(44),
});

export const devRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // POST /create-challenge — create a test challenge (with optional attempt #)
  // -------------------------------------------------------------------------
  app.post('/create-challenge', async (request, reply) => {
    const parse = CreateChallengeSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message ?? 'Invalid request body',
      });
    }

    const { walletAddress, accountSize, attemptNumber: requestedAttempt } = parse.data;

    // Upsert trader
    const trader = await prisma.trader.upsert({
      where: { walletAddress },
      create: { walletAddress },
      update: {},
    });

    // Cancel any existing active attempt
    await prisma.attempt.updateMany({
      where: { traderId: trader.id, status: 'ACTIVE' },
      data: { status: 'ABANDONED', endedAt: new Date() },
    });

    // Count completed attempts for attempt number (or use requested)
    const completedCount = await prisma.attempt.count({
      where: { traderId: trader.id, status: { in: ['PASSED', 'FAILED'] } },
    });
    const attemptNumber = requestedAttempt ?? (completedCount + 1);

    const startingBalance = accountSize;
    const profitTarget = startingBalance * 1.08;
    const maxDrawdownFloor = startingBalance * 0.92;
    const phase = attemptNumber < FIRST_FUNDED_ATTEMPT ? 'EVALUATION' : 'FUNDED';

    const attempt = await prisma.attempt.create({
      data: {
        traderId: trader.id,
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
        tokenUsed: 'USDC',
        txSignature: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        startedAt: new Date(),
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        traderId: trader.id,
        attemptId: attempt.id,
        walletAddress,
        accountSize,
        attemptNumber,
        phase,
        profitTarget,
        maxDrawdownFloor,
        message: `Challenge created: $${accountSize} account, attempt #${attemptNumber} (${phase})`,
      },
    });
  });

  // -------------------------------------------------------------------------
  // POST /simulate-pass — instantly pass a trader's active attempt
  // -------------------------------------------------------------------------
  app.post('/simulate-pass', async (request, reply) => {
    const parse = SimulatePassSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message ?? 'Invalid request body',
      });
    }

    const { walletAddress } = parse.data;

    // Find the trader
    const trader = await prisma.trader.findUnique({
      where: { walletAddress },
      select: { id: true },
    });

    if (!trader) {
      return reply.status(404).send({ success: false, error: 'Trader not found' });
    }

    // Find their active attempt
    const attempt = await prisma.attempt.findFirst({
      where: { traderId: trader.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt) {
      return reply.status(400).send({
        success: false,
        error: 'No active attempt — create a challenge first',
      });
    }

    // Set balance to profit target (instant pass)
    const profitTarget = Number(attempt.profitTarget);
    const startingBalance = Number(attempt.startingBalance);
    const profit = profitTarget - startingBalance;
    const isFunded = attempt.attemptNumber >= FIRST_FUNDED_ATTEMPT;

    // Close all open positions at entry price (zero P&L)
    await prisma.position.updateMany({
      where: { attemptId: attempt.id, status: 'OPEN' },
      data: { status: 'CLOSED', closedAt: new Date(), unrealizedPnl: 0 },
    });

    // Update attempt to PASSED with profit target balance
    await prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        status: 'PASSED',
        currentBalance: profitTarget,
        peakBalance: profitTarget,
        realizedPnl: profit,
        unrealizedPnl: 0,
        phase: isFunded ? 'FUNDED' : attempt.phase,
        endedAt: new Date(),
      },
    });

    // Create payout if funded
    let payoutCreated = false;
    if (isFunded) {
      try {
        await createPassPayout(attempt.id);
        payoutCreated = true;
      } catch {
        // ignore — log in service
      }
    }

    return reply.status(200).send({
      success: true,
      data: {
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        phase: isFunded ? 'FUNDED' : attempt.phase,
        status: 'PASSED',
        profit,
        payoutCreated,
        message: isFunded
          ? `Funded attempt #${attempt.attemptNumber} passed — $${profit.toFixed(2)} payout queued`
          : `Evaluation attempt #${attempt.attemptNumber} passed — no payout (eval phase)`,
      },
    });
  });

  // -------------------------------------------------------------------------
  // POST /fire-vault — manually trigger a vault fire (no auth)
  // -------------------------------------------------------------------------
  app.post('/fire-vault', async (_request, reply) => {
    // Count pending before firing
    const pendingBefore = await prisma.payoutRequest.count({
      where: { status: 'PENDING' },
    });

    if (pendingBefore === 0) {
      return reply.status(200).send({
        success: true,
        data: {
          message: 'No pending payouts — vault fire skipped',
          tradersPaid: 0,
          totalAmount: 0,
        },
      });
    }

    try {
      await processPayoutBatch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        success: false,
        error: `Vault fire failed: ${message}`,
      });
    }

    // Get the latest batch for stats
    const lastBatch = await prisma.payoutBatch.findFirst({
      orderBy: { processedAt: 'desc' },
      select: {
        successful: true,
        failed: true,
        totalAmountUsd: true,
        processedAt: true,
      },
    });

    return reply.status(200).send({
      success: true,
      data: {
        message: `Vault fire complete — ${lastBatch?.successful ?? 0} traders paid`,
        tradersPaid: lastBatch?.successful ?? 0,
        totalAmount: Number(lastBatch?.totalAmountUsd ?? 0),
        failed: lastBatch?.failed ?? 0,
        firedAt: lastBatch?.processedAt,
      },
    });
  });

  // -------------------------------------------------------------------------
  // POST /close-trader-account — devnet: close the on-chain TraderAccount PDA
  // -------------------------------------------------------------------------
  app.post('/close-trader-account', async (request, reply) => {
    const parse = CloseTraderAccountSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message ?? 'Invalid request body',
      });
    }

    try {
      const signature = await forceCloseTraderAccount(parse.data.wallet);
      return reply.status(200).send({ success: true, signature });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, wallet: parse.data.wallet }, '[dev] close-trader-account failed');
      return reply.status(500).send({ success: false, error: message });
    }
  });
};
