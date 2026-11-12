// =============================================================================
// Setl8 Backend — Server Startup
//
// Boot order:
//   1. Connect Postgres + Redis
//   2. Build Fastify app
//   3. Init market price feed (Binance + Finnhub + Metals.live)
//   4. Wire evaluator to WS registry
//   5. Start BullMQ workers
//   6. Start HTTP listener
// =============================================================================

import { buildApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { logger } from './lib/logger.js';
import { config } from './config.js';
import { marketService } from './synthetic/market.js';
import { evaluatorService } from './synthetic/evaluator.js';
import { startWorkers, stopWorkers } from './jobs/index.js';
import { initActiveMarkets } from './services/marketCapFilter.js';
import { initCandleAggregator } from './lib/candles.js';

export async function startServer(): Promise<void> {
  // ---------------------------------------------------------------------------
  // 1. Infrastructure connections
  // ---------------------------------------------------------------------------

  await prisma.$connect();
  await redis.ping();

  // Default payout pause for presale period
  const existingPause = await redis.get('platform:payouts_paused');
  if (existingPause === null) {
    await redis.set('platform:payouts_paused', 'true');
    logger.info('[startup] Payouts paused by default (presale mode)');
  }

  // ---------------------------------------------------------------------------
  // 2. Build Fastify app (registers all routes + plugins)
  // ---------------------------------------------------------------------------

  const app = await buildApp();

  app.log.info('PostgreSQL connected');
  app.log.info('Redis connected');

  // ---------------------------------------------------------------------------
  // 3. Load active market list from Redis (or seed defaults)
  // ---------------------------------------------------------------------------

  await initActiveMarkets();

  // ---------------------------------------------------------------------------
  // 4. Register candle aggregator (must be before price feed starts)
  // ---------------------------------------------------------------------------

  initCandleAggregator();

  // ---------------------------------------------------------------------------
  // 5. Start price feed (Bybit WS + Finnhub WS + Finnhub REST)
  // ---------------------------------------------------------------------------

  await marketService.init();
  app.log.info('Price feed initialised');

  // ---------------------------------------------------------------------------
  // 6. Wire evaluator (no-op for WS — registry handles delivery)
  // ---------------------------------------------------------------------------

  evaluatorService.setApp(app);

  // ---------------------------------------------------------------------------
  // 7. Start BullMQ workers + schedule repeating jobs
  // ---------------------------------------------------------------------------

  await startWorkers();
  app.log.info('BullMQ workers started');

  // ---------------------------------------------------------------------------
  // 8. Start HTTP / WS listener
  // ---------------------------------------------------------------------------

  await app.listen({ port: config.port, host: '0.0.0.0' });

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------

  async function shutdown(signal: string): Promise<void> {
    app.log.info(`Received ${signal} — shutting down gracefully`);

    await app.close();
    await stopWorkers();
    marketService.stop();
    await prisma.$disconnect();
    redis.disconnect();

    app.log.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGINT',  () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
}
