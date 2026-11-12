// =============================================================================
// Telegram — Fastify Plugin
//
// Registers the webhook endpoint and starts the bot.
// Uses long polling in dev (no TELEGRAM_WEBHOOK_URL), webhook in production.
// =============================================================================

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { webhookCallback } from 'grammy';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { getBot } from './bot.js';
import { registerHandlers } from './menu.js';
import { registerLinkRoutes } from './link.js';
import type { BotContext } from './middleware.js';

export const telegramPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Register the link-code HTTP endpoint (JWT-protected, always available)
  await registerLinkRoutes(app);

  const bot = getBot();
  if (!bot) {
    logger.info('[telegram] No TELEGRAM_BOT_TOKEN — bot disabled');
    return;
  }

  // Register all command/callback handlers
  registerHandlers(bot as unknown as import('grammy').Bot<BotContext>);

  if (config.telegramWebhookUrl) {
    // Production: webhook mode
    const webhookPath = '/api/telegram/webhook';
    const fullUrl = `${config.telegramWebhookUrl}${webhookPath}`;

    // Register webhook route
    app.post(webhookPath, {
      config: { rawBody: true },
    }, async (request, reply) => {
      const handler = webhookCallback(bot, 'fastify');
      return handler(request, reply);
    });

    // Set webhook on startup
    app.addHook('onReady', async () => {
      try {
        await bot.api.setWebhook(fullUrl);
        logger.info({ url: fullUrl }, '[telegram] Webhook set');
      } catch (err) {
        logger.error({ err: (err as Error).message }, '[telegram] Failed to set webhook');
      }
    });
  } else {
    // Development: long polling
    app.addHook('onReady', async () => {
      try {
        // Delete any existing webhook first
        await bot.api.deleteWebhook();
        // Start polling in background — don't await (would block server)
        bot.start({
          onStart: () => logger.info('[telegram] Bot started (long polling)'),
        });
      } catch (err) {
        logger.error({ err: (err as Error).message }, '[telegram] Failed to start polling');
      }
    });

    // Stop polling gracefully on server close
    app.addHook('onClose', async () => {
      bot.stop();
    });
  }
};
