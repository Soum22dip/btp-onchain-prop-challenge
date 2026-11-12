// =============================================================================
// Setl8 Backend — Evaluator BullMQ Job
//
// Two repeating jobs:
//   1. evaluate-tick — runs every 1 second to check P&L, drawdown, profit target
//   2. evaluate-snapshot — runs every 8 hours (00:00, 08:00, 16:00 SGT)
//      to persist AttemptSnapshot rows for the dashboard chart
// =============================================================================

import { Queue, Worker } from 'bullmq';
import { QUEUE_NAMES } from '@setl8/constants';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

/** Plain connection opts — BullMQ creates its own ioredis instance. */
function redisOpts() {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    ...(url.password ? { password: url.password } : {}),
    maxRetriesPerRequest: null as null,
  };
}

import { evaluatorService } from '../synthetic/evaluator.js';
import { prisma } from '../lib/prisma.js';
import { marketService } from '../synthetic/market.js';
import { checkDrawdown } from '../synthetic/pnl.js';

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

const queueConnection = redisOpts();

export const evaluatorQueue = new Queue(QUEUE_NAMES.evaluatorTick, {
  connection: queueConnection,
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 200 },
});

export const snapshotQueue = new Queue(QUEUE_NAMES.pnlSnapshot, {
  connection: queueConnection,
  defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100 },
});

// ---------------------------------------------------------------------------
// Tick processor — runs every 1 second
// ---------------------------------------------------------------------------

async function runEvaluatorTick(): Promise<void> {
  const start = Date.now();
  await evaluatorService.evaluateAll();
  const elapsed = Date.now() - start;
  if (elapsed > 500) {
    logger.warn(`[evaluator] Tick took ${elapsed}ms — may be too slow for 1s interval`);
  }
}

// ---------------------------------------------------------------------------
// Snapshot processor — runs every 8 hours
// ---------------------------------------------------------------------------

async function runSnapshot(): Promise<void> {
  const activeAttempts = await prisma.attempt.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      currentBalance: true,
      startingBalance: true,
      peakBalance: true,
      maxDrawdownFloor: true,
      profitTarget: true,
    },
  });

  const now = new Date();

  await Promise.all(
    activeAttempts.map(async (attempt) => {
      const currentBalance = Number(attempt.currentBalance);
      const startingBalance = Number(attempt.startingBalance);

      const pnlPercent = ((currentBalance - startingBalance) / startingBalance) * 100;

      const { drawdownPct } = checkDrawdown(
        {
          startingBalance: attempt.startingBalance,
          peakBalance: attempt.peakBalance,
          maxDrawdownFloor: attempt.maxDrawdownFloor,
          profitTarget: attempt.profitTarget,
        },
        currentBalance,
      );

      await prisma.attemptSnapshot.create({
        data: {
          attemptId: attempt.id,
          balance: currentBalance,
          pnlPercent,
          drawdownPercent: drawdownPct,
          snapshotAt: now,
        },
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// createEvaluatorWorker — 1-second tick
// ---------------------------------------------------------------------------

export function createEvaluatorWorker(): Worker {
  const workerConnection = redisOpts();

  const worker = new Worker(
    QUEUE_NAMES.evaluatorTick,
    async () => {
      await runEvaluatorTick();
    },
    { connection: workerConnection, concurrency: 1 },
  );

  worker.on('failed', (_job, err) => {
    logger.error({ err: err.message }, '[evaluator-job] Tick failed');
  });

  return worker;
}

// ---------------------------------------------------------------------------
// createSnapshotWorker — 8-hour cron
// ---------------------------------------------------------------------------

export function createSnapshotWorker(): Worker {
  const workerConnection = redisOpts();

  const worker = new Worker(
    QUEUE_NAMES.pnlSnapshot,
    async () => {
      await runSnapshot();
    },
    { connection: workerConnection, concurrency: 1 },
  );

  worker.on('failed', (_job, err) => {
    logger.error({ err: err.message }, '[snapshot-job] Job failed');
  });

  return worker;
}

// ---------------------------------------------------------------------------
// scheduleEvaluatorJob — registers both repeating jobs (idempotent)
// ---------------------------------------------------------------------------

export async function scheduleEvaluatorJob(): Promise<void> {
  // Remove stale repeatable jobs
  const tickRepeatables = await evaluatorQueue.getRepeatableJobs();
  for (const r of tickRepeatables) {
    await evaluatorQueue.removeRepeatableByKey(r.key);
  }

  const snapRepeatables = await snapshotQueue.getRepeatableJobs();
  for (const r of snapRepeatables) {
    await snapshotQueue.removeRepeatableByKey(r.key);
  }

  // Evaluator tick — every 1 second
  await evaluatorQueue.add(
    'evaluate-tick',
    {},
    {
      repeat: {
        every: 1_000,
      },
    },
  );

  // Snapshot — every 8 hours (00:00, 08:00, 16:00 UTC = 08:00, 16:00, 00:00 SGT)
  await snapshotQueue.add(
    'snapshot',
    {},
    {
      repeat: {
        pattern: '0 0,8,16 * * *',
      },
    },
  );
}

// Keep marketService accessible without re-importing in the job
export { marketService };
