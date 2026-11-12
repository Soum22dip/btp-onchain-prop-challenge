// =============================================================================
// Telegram — Auth Middleware (attaches trader to context)
// =============================================================================

import type { Context, NextFunction } from 'grammy';
import { prisma } from '../lib/prisma.js';

export interface TraderContext {
  trader: {
    id: string;
    walletAddress: string;
    status: string;
    telegramAlerts: boolean;
  };
}

// Grammy context flavor: ctx.trader is available after middleware
export type BotContext = Context & { trader?: TraderContext['trader'] };

const SKIP_COMMANDS = new Set(['/start', '/link']);

export async function authMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  // Skip auth for /start and /link commands
  const text = ctx.message?.text ?? '';
  if (SKIP_COMMANDS.has(text.split(' ')[0])) {
    return next();
  }

  // Also skip for callback queries to menu:main (which shows the menu)
  // and any message that looks like a link code
  if (/^[A-Z0-9]{6}$/.test(text)) {
    return next();
  }

  const chatId = String(ctx.chat?.id ?? '');
  if (!chatId) return;

  const trader = await prisma.trader.findUnique({
    where: { telegramChatId: chatId },
    select: { id: true, walletAddress: true, status: true, telegramAlerts: true },
  });

  if (!trader) {
    await ctx.reply(
      '\u{1F517} *Account not linked*\n\n' +
      '1\\. Go to setl8\\.com/dashboard\n' +
      '2\\. Click Link Telegram\n' +
      '3\\. Send the 6\\-digit code here\n\n' +
      'Or type /link for instructions\\.',
      { parse_mode: 'MarkdownV2' },
    );
    return;
  }

  ctx.trader = trader;
  return next();
}
