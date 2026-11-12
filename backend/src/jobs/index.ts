// =============================================================================
// Setl8 Backend — Job Workers Entry Point
//
// Starts all BullMQ workers and schedules repeating jobs.
// Call startWorkers() once after infrastructure is confirmed healthy.
// =============================================================================

import { type Worker } from 'bullmq';
import {
  evaluatorQueue,
  snapshotQueue,
  createEvaluatorWorker,
  createSnapshotWorker,
  scheduleEvaluatorJob,
} from './evaluator.job.js';
import {
  payoutQueue,
  createPayoutWorker,
  schedulePayoutJob,
} from './payout.job.js';
import {
  marketCapQueue,
  createMarketCapWorker,
  scheduleMarketCapJob,
} from './marketCap.job.js';
import { logger } from '../lib/logger.js';

export { evaluatorQueue, snapshotQueue, payoutQueue, marketCapQueue };

let workers: Worker[] = [];

// ---------------------------------------------------------------------------
// startWorkers
// ---------------------------------------------------------------------------

export async function startWorkers(): Promise<void> {
  // Register repeating jobs (idempotent — removes stale schedules first)
  await scheduleEvaluatorJob();
  await schedulePayoutJob();
  await scheduleMarketCapJob();

  // Spin up workers
  workers = [createEvaluatorWorker(), createSnapshotWorker(), createPayoutWorker(), createMarketCapWorker()];

  logger.info('[jobs] Workers started: evaluator-tick, pnl-snapshot, payout-batch, market-cap-filter');
}

// ---------------------------------------------------------------------------
// stopWorkers — called during graceful shutdown
// ---------------------------------------------------------------------------

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  await evaluatorQueue.close();
  await snapshotQueue.close();
  await payoutQueue.close();
  await marketCapQueue.close();
  workers = [];
  logger.info('[jobs] All workers stopped');
}
