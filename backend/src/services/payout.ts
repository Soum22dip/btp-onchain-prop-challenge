// =============================================================================
// Setl8 Backend — Payout Service (v2)
//
// Auto-creates PayoutRequest records when funded traders pass.
// Payout amount = fixed 8% of account size (not profit-based).
// Called by the evaluator when it detects a PASSED attempt.
// =============================================================================

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { sendTraderAlert } from '../telegram/alerts.js';

// ---------------------------------------------------------------------------
// createPassPayout — called when a funded attempt hits the profit target
// ---------------------------------------------------------------------------

export async function createPassPayout(attemptId: string): Promise<void> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      trader: { select: { walletAddress: true } },
    },
  });

  if (!attempt) return;

  // Only funded phases get payouts
  if (attempt.phase !== 'FUNDED') {
    logger.info(
      { attemptId, attemptNumber: attempt.attemptNumber, phase: attempt.phase },
      '[payout] Evaluation phase pass — no payout',
    );
    return;
  }

  // Don't double-create payouts for the same attempt
  const existing = await prisma.payoutRequest.findFirst({
    where: {
      attemptId,
      status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
    },
  });

  if (existing) {
    logger.info(
      { attemptId, existingPayoutId: existing.id },
      '[payout] Payout already exists for this attempt — skipping',
    );
    return;
  }

  // Fixed 8% of account size — NOT based on profit earned
  const accountSize = Number(attempt.accountSize);
  const payoutAmount = accountSize * 0.08;

  if (payoutAmount <= 0) {
    logger.warn(
      { attemptId, accountSize },
      '[payout] Account size is 0 — no payout created',
    );
    return;
  }

  const payoutRequest = await prisma.payoutRequest.create({
    data: {
      traderId: attempt.traderId,
      attemptId,
      walletAddress: attempt.trader.walletAddress,
      amountUsd: payoutAmount,
      tokenSymbol: attempt.tokenUsed,
      status: 'PENDING',
    },
  });

  logger.info(
    {
      payoutId: payoutRequest.id,
      traderId: attempt.traderId,
      attemptId,
      attemptNumber: attempt.attemptNumber,
      payoutAmount: payoutAmount.toFixed(2),
      accountSize,
      wallet: attempt.trader.walletAddress,
    },
    `[payout] Payout queued: $${payoutAmount.toFixed(2)} (8% of $${accountSize})`,
  );

  // Check if payouts are globally paused and notify trader
  const isPaused = await redis.get('platform:payouts_paused');
  if (isPaused === 'true') {
    logger.info(
      { payoutId: payoutRequest.id, traderId: attempt.traderId },
      '[payout] Payout queued but global pause active — will process after mainnet launch',
    );
    sendTraderAlert(attempt.traderId, {
      type: 'payout_queued_paused',
      amount: payoutAmount,
    }).catch(() => {});
  }
}
