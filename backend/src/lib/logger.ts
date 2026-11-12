// =============================================================================
// Setl8 Backend — Standalone Pino Logger
//
// Used by modules that run outside the Fastify request context (BullMQ workers,
// Redis client, process-level error handlers).  Fastify's built-in logger
// should be preferred inside route handlers and plugins.
// =============================================================================

import pino from 'pino';

// Bootstrap exception: logger must NOT import config.ts because it is used to
// report config startup failures. NODE_ENV is the only env var accessed directly.
const isDev = (process.env['NODE_ENV'] ?? 'development') === 'development';

export const logger = pino(
  isDev
    ? {
        level: 'debug',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
        },
      }
    : { level: 'info' },
);
