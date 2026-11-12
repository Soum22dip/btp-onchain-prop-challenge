// =============================================================================
// Setl8 Backend — Redis Client Singleton
// =============================================================================

import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

export const redis = new Redis(config.redisUrl, {
  // Required for BullMQ workers — disables the default retry-on-blocking-command
  // behaviour so Bull can use BLMOVE / BRPOPLPUSH without a timeout error.
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err: Error) => {
  // Errors are logged here so the process doesn't crash on transient drops.
  // BullMQ and application code handle reconnect automatically.
  logger.error({ err: err.message }, '[redis] Connection error');
});
