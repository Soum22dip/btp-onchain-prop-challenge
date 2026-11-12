// =============================================================================
// Telegram — Account Linking (/link flow + HTTP endpoint)
// =============================================================================

import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { BotContext } from './middleware.js';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { verifyJWT } from '../middleware/auth.js';
import { escapeMarkdown } from './formatters.js';
import { mainMenuKeyboard } from './bot.js';

const CODE_TTL = 300; // 5 minutes
const CODE_PREFIX = 'telegram:link:';

// ---------------------------------------------------------------------------
// HTTP endpoint: POST /api/telegram/link-code (JWT-protected)
// ---------------------------------------------------------------------------

export async function registerLinkRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/telegram/link-code', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;

    // Generate 6-char alphanumeric code
    const code = randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
    await redis.setex(`${CODE_PREFIX}${code}`, CODE_TTL, traderId);

    return reply.status(200).send({ success: true, data: { code } });
  });
}

// ---------------------------------------------------------------------------
// Bot: /link command handler
// ---------------------------------------------------------------------------

export async function handleLinkCommand(ctx: BotContext): Promise<void> {
  await ctx.reply(
    '\u{1F517} *Link Your Account*\n\n' +
    '1\\. Go to your dashboard at setl8\\.com\n' +
    '2\\. Click *Link Telegram*\n' +
    '3\\. Copy the 6\\-digit code\n' +
    '4\\. Paste it here\n\n' +
    'The code expires in 5 minutes\\.',
    { parse_mode: 'MarkdownV2' },
  );
}

// ---------------------------------------------------------------------------
// Bot: handle 6-char code messages
// ---------------------------------------------------------------------------

export async function handleLinkCode(ctx: BotContext): Promise<void> {
  const code = ctx.message?.text?.trim().toUpperCase();
  if (!code || !/^[A-Z0-9]{6}$/.test(code)) return;

  const chatId = String(ctx.chat?.id ?? '');
  if (!chatId) return;

  // Check if already linked
  const existing = await prisma.trader.findUnique({
    where: { telegramChatId: chatId },
    select: { id: true },
  });
  if (existing) {
    await ctx.reply(
      '\u{2705} Your account is already linked\\!\n\nType /start to open the menu\\.',
      { parse_mode: 'MarkdownV2' },
    );
    return;
  }

  // Look up the code in Redis
  const key = `${CODE_PREFIX}${code}`;
  const traderId = await redis.get(key);

  if (!traderId) {
    await ctx.reply(
      '\u{274C} Invalid or expired code\\. Please generate a new one from your dashboard\\.',
      { parse_mode: 'MarkdownV2' },
    );
    return;
  }

  // Link the account
  await prisma.trader.update({
    where: { id: traderId },
    data: { telegramChatId: chatId },
  });

  // Delete the code
  await redis.del(key);

  const trader = await prisma.trader.findUnique({
    where: { id: traderId },
    select: { walletAddress: true },
  });

  const wallet = trader?.walletAddress ?? 'unknown';
  const truncated = `${wallet.slice(0, 6)}\\.\\.${wallet.slice(-4)}`;

  await ctx.reply(
    `\u{2705} *Account Linked\\!*\n\nWallet: \`${truncated}\`\n\nYou'll now receive trade alerts and can manage your account here\\.`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: mainMenuKeyboard(),
    },
  );
}
