// =============================================================================
// Setl8 Backend — Fastify Application Factory
//
// Builds and returns the configured Fastify instance.
// All plugins and routes are registered here so the app can be
// imported cleanly by server.ts and by test helpers.
// =============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { redis } from './lib/redis.js';
import { authRoutes } from './api/auth/index.js';
import { attemptsRoutes } from './api/attempts/index.js';
import { positionRoutes } from './api/positions/index.js';
import { payoutRoutes } from './api/payouts/index.js';
import { wsRoutes } from './api/ws/index.js';
import { traderRoutes } from './api/trader/index.js';
import { adminRoutes } from './api/admin/index.js';
import { publicRoutes } from './api/public/index.js';
import { devRoutes } from './api/dev/index.js';
import { telegramPlugin } from './telegram/plugin.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.isDev ? 'debug' : 'info',
      ...(config.isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            },
          }
        : {}),
    },
  });

  // ---------------------------------------------------------------------------
  // Plugins
  // ---------------------------------------------------------------------------

  await app.register(cors, {
    origin: config.isProd
      ? [
          'https://setl8.com',
          'https://www.setl8.com',
          'https://trade.setl8.com',
          'https://admin.setl8.com',
          ...(config.corsOrigin ? [config.corsOrigin] : []),
        ]
      : true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: '7d' },
  });

  await app.register(websocket);

  // ---------------------------------------------------------------------------
  // Global rate limit — 100 req/min per IP
  // ---------------------------------------------------------------------------

  await app.register(rateLimit, {
    max: config.isProd ? 100 : 1000,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (req) => req.ip,
  });

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  // Health check (unauthenticated, excluded from rate limit)
  app.get('/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // Auth — 5/min in prod to prevent brute-force
  await app.register(async (scope: FastifyInstance) => {
    await scope.register(rateLimit, {
      max: config.isProd ? 5 : 100,
      timeWindow: '1 minute',
      redis,
      keyGenerator: (req) => req.ip,
    });
    await scope.register(authRoutes);
  }, { prefix: '/api/auth' });

  // Trader-specific (JWT required)
  await app.register(traderRoutes,   { prefix: '/api/trader' });
  await app.register(attemptsRoutes, { prefix: '/api/attempts' });

  // Positions — 10/min in prod
  await app.register(async (scope: FastifyInstance) => {
    await scope.register(rateLimit, {
      max: config.isProd ? 10 : 100,
      timeWindow: '1 minute',
      redis,
      keyGenerator: (req) => req.ip,
    });
    await scope.register(positionRoutes);
  }, { prefix: '/api/positions' });

  await app.register(payoutRoutes, { prefix: '/api/payouts' });

  // WebSocket (authenticated via query-string token)
  await app.register(wsRoutes, { prefix: '/api/ws' });

  // Public
  await app.register(publicRoutes, { prefix: '/api' });

  // Admin — 30/min in prod
  await app.register(async (scope: FastifyInstance) => {
    await scope.register(rateLimit, {
      max: config.isProd ? 30 : 200,
      timeWindow: '1 minute',
      redis,
      keyGenerator: (req) => req.ip,
    });
    await scope.register(adminRoutes);
  }, { prefix: '/api/admin' });

  // Telegram bot
  await app.register(telegramPlugin);

  // Dev helpers — development/test ONLY, completely absent in production
  if (!config.isProd) {
    await app.register(async (scope: FastifyInstance) => {
      await scope.register(rateLimit, {
        max: 1000,
        timeWindow: '1 minute',
        redis,
        keyGenerator: (req) => req.ip,
      });
      await scope.register(devRoutes);
    }, { prefix: '/api/dev' });
  }

  return app;
}
