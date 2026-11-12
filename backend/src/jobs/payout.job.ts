// =============================================================================
// Setl8 Backend — Heartbeat Payout Job (v2)
//
// Runs every 5 days (HEARTBEAT_INTERVAL_HOURS). Processes all queued payouts:
//   1. Calls process_heartbeat_open on-chain (permissionless, enforces 5-day interval)
//   2. Fetches all PENDING PayoutRequests from DB
//   3. Calls process_payout on-chain for each (permissionless, pro-rata)
//   4. Updates DB records with tx signatures and status
//   5. Calls process_heartbeat_close on-chain
// =============================================================================

import { Queue, Worker } from 'bullmq';
import { QUEUE_NAMES, REDIS_KEYS } from '@setl8/constants';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import {
  processHeartbeatOpen,
  processQueuedPayout,
  processHeartbeatClose,
  phaseNumber,
} from '../lib/solana.js';
import { sendTraderAlert } from '../telegram/alerts.js';

function redisOpts() {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    ...(url.password ? { password: url.password } : {}),
    maxRetriesPerRequest: null as null,
  };
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

const queueConnection = redisOpts();

export const payoutQueue = new Queue(QUEUE_NAMES.payoutBatch, {
  connection: queueConnection,
  defaultJobOptions: { removeOnComplete: 50, removeOnFail: 200 },
});

// ---------------------------------------------------------------------------
// Core processor
// ---------------------------------------------------------------------------

export async function processPayoutBatch(): Promise<void> {
  const lockKey = 'lock:heartbeat';
  const acquired = await redis.set(lockKey, '1', 'EX', 600, 'NX');
  if (!acquired) {
    logger.warn('[heartbeat] Already running — skipping');
    return;
  }

  try {
    await _processHeartbeat();
  } finally {
    await redis.del(lockKey);
  }
}

async function _processHeartbeat(): Promise<void> {
  // Check global pause
  const paused = await redis.get('platform:payouts_paused');
  if (paused === 'true') {
    logger.info('[heartbeat] Payouts globally paused (presale mode) — skipping');
    return;
  }

  // Step 1: Open the heartbeat window on-chain
  logger.info('[heartbeat] Opening heartbeat window...');
  const openSig = await processHeartbeatOpen();

  if (!openSig) {
    logger.warn('[heartbeat] Heartbeat open failed — interval not reached or error. Skipping batch.');
    return;
  }

  logger.info({ sig: openSig }, '[heartbeat] Window opened');

  // Step 2: Get all pending payouts from DB
  const pendingPayouts = await prisma.payoutRequest.findMany({
    where: { status: 'PENDING' },
    include: {
      attempt: {
        select: { attemptNumber: true, traderId: true },
      },
    },
    orderBy: { requestedAt: 'asc' },
  });

  if (pendingPayouts.length === 0) {
    logger.info('[heartbeat] No pending payouts — closing window');
    await processHeartbeatClose();
    return;
  }

  logger.info({ count: pendingPayouts.length }, '[heartbeat] Processing payouts...');

  let successCount = 0;
  let failCount = 0;
  const totalAmount = pendingPayouts.reduce((s, r) => s + Number(r.amountUsd), 0);

  // Step 3: Process each payout on-chain
  for (const req of pendingPayouts) {
    try {
      const passedBefore = await prisma.attempt.count({
        where: {
          traderId: req.attempt.traderId,
          status: 'PASSED',
          attemptNumber: { lte: req.attempt.attemptNumber },
        },
      });
      const phase = phaseNumber(passedBefore - 1);

      const sig = await processQueuedPayout({
        traderWallet: req.walletAddress,
        phaseNumber: phase,
      });

      if (sig) {
        await prisma.payoutRequest.update({
          where: { id: req.id },
          data: {
            status: 'COMPLETED',
            onchainTxSignature: sig,
            processedAt: new Date(),
          },
        });

        await prisma.attempt.update({
          where: { id: req.attemptId },
          data: { totalPayoutTaken: { increment: Number(req.amountUsd) } },
        });

        successCount++;
        logger.info(
          { wallet: req.walletAddress, amount: Number(req.amountUsd), sig },
          '[heartbeat] Payout processed',
        );

        // Telegram alert (non-blocking)
        sendTraderAlert(req.attempt.traderId, {
          type: 'payout_processed',
          amount: Number(req.amountUsd),
          txSignature: sig,
        }).catch(() => {});
      } else {
        failCount++;
        logger.warn(
          { wallet: req.walletAddress, amount: Number(req.amountUsd) },
          '[heartbeat] Payout failed — will retry next heartbeat',
        );
      }
    } catch (err) {
      failCount++;
      logger.error(
        { wallet: req.walletAddress, err: (err as Error).message },
        '[heartbeat] Payout error',
      );
    }
  }

  // Step 4: Close the heartbeat window
  const closeSig = await processHeartbeatClose();
  logger.info({ sig: closeSig }, '[heartbeat] Window closed');

  // Step 5: Store stats
  const fireStats = {
    firedAt: new Date().toISOString(),
    tradersPaid: successCount,
    totalAmount,
    failed: failCount,
  };
  await redis.set(REDIS_KEYS.vaultFireLast(), JSON.stringify(fireStats));

  logger.info(
    { successCount, failCount, totalAmount },
    `[heartbeat] Complete — ${successCount} traders paid, $${totalAmount.toFixed(2)} total`,
  );
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export function createPayoutWorker(): Worker {
  const workerConnection = redisOpts();

  const worker = new Worker(
    QUEUE_NAMES.payoutBatch,
    async () => {
      await processPayoutBatch();
    },
    { connection: workerConnection, concurrency: 1 },
  );

  worker.on('failed', (_job, err) => {
    logger.error({ err: err.message }, '[heartbeat] Job failed');
  });

  return worker;
}

// ---------------------------------------------------------------------------
// Schedule — every 5 days (120 hours)
// ---------------------------------------------------------------------------

export async function schedulePayoutJob(): Promise<void> {
  const intervalMs = config.vaultFireIntervalHours * 60 * 60 * 1000;

  const repeatables = await payoutQueue.getRepeatableJobs();
  for (const r of repeatables) {
    await payoutQueue.removeRepeatableByKey(r.key);
  }

  await payoutQueue.add(
    'heartbeat-payout',
    {},
    { repeat: { every: intervalMs } },
  );

  logger.info(
    { intervalHours: config.vaultFireIntervalHours },
    `[heartbeat] Scheduled every ${config.vaultFireIntervalHours}h`,
  );
}
