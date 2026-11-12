// =============================================================================
// Setl8 Backend — Market Cap Filter BullMQ Job
//
// Runs every 3 hours.  Refreshes the active crypto market list by checking
// CoinGecko market caps and cross-referencing with Binance USDT pairs.
// =============================================================================

import { Queue, Worker } from 'bullmq';
import { QUEUE_NAMES } from '@setl8/constants';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { runMarketCapFilter } from '../services/marketCapFilter.js';

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

export const marketCapQueue = new Queue(QUEUE_NAMES.marketCapFilter, {
  connection: queueConnection,
  defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100 },
});

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export function createMarketCapWorker(): Worker {
  const workerConnection = redisOpts();

  const worker = new Worker(
    QUEUE_NAMES.marketCapFilter,
    async () => {
      await runMarketCapFilter();
    },
    { connection: workerConnection, concurrency: 1 },
  );

  worker.on('failed', (_job, err) => {
    logger.error({ err: err.message }, '[market-cap-job] Job failed');
  });

  return worker;
}

// ---------------------------------------------------------------------------
// Schedule — every 3 hours (idempotent)
// ---------------------------------------------------------------------------

export async function scheduleMarketCapJob(): Promise<void> {
  const repeatables = await marketCapQueue.getRepeatableJobs();
  for (const r of repeatables) {
    await marketCapQueue.removeRepeatableByKey(r.key);
  }

  await marketCapQueue.add(
    'market-cap-filter',
    {},
    {
      repeat: {
        pattern: '0 */3 * * *', // every 3 hours
      },
    },
  );
}
