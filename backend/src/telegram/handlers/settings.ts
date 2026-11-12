// =============================================================================
// Telegram — Settings Handlers
// =============================================================================

import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../middleware.js';
import { prisma } from '../../lib/prisma.js';
import { escapeMarkdown } from '../formatters.js';
import { mainMenuKeyboard } from '../bot.js';

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------

export async function handleSettings(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;

  const trader = await prisma.trader.findUnique({
    where: { id: ctx.trader.id },
    select: { telegramAlerts: true, walletAddress: true },
  });
  if (!trader) return;

  const alertStatus = trader.telegramAlerts ? '\u{2705} ON' : '\u{274C} OFF';
  const wallet = `${trader.walletAddress.slice(0, 6)}\\.\\.${trader.walletAddress.slice(-4)}`;

  const text =
    `\u{2699}\u{FE0F} *Settings*\n\n` +
    `\u{1F514} Alerts: ${alertStatus}\n` +
    `\u{1F517} Account: Linked \\u2713 \\(${wallet}\\)`;

  const keyboard = new InlineKeyboard()
    .text(`\u{1F514} Toggle Alerts`, 'settings:toggle_alerts')
    .row()
    .text('\u{1F517} Unlink Account', 'settings:unlink_confirm')
    .row()
    .text('\u{2B05}\u{FE0F} Menu', 'menu:main');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  }
}

// ---------------------------------------------------------------------------
// Toggle alerts
// ---------------------------------------------------------------------------

export async function handleToggleAlerts(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;

  const trader = await prisma.trader.findUnique({
    where: { id: ctx.trader.id },
    select: { telegramAlerts: true },
  });
  if (!trader) return;

  const newState = !trader.telegramAlerts;
  await prisma.trader.update({
    where: { id: ctx.trader.id },
    data: { telegramAlerts: newState },
  });

  // Re-render settings
  ctx.trader.telegramAlerts = newState;
  await handleSettings(ctx);
  await ctx.answerCallbackQuery({ text: `Alerts ${newState ? 'enabled' : 'disabled'}` });
}

// ---------------------------------------------------------------------------
// Unlink
// ---------------------------------------------------------------------------

export async function handleUnlinkConfirm(ctx: BotContext): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('\u{2705} Yes, Unlink', 'settings:unlink')
    .text('\u{274C} Cancel', 'menu:settings');

  await ctx.editMessageText(
    '\u{26A0}\u{FE0F} *Unlink Account?*\n\n' +
    'You will stop receiving alerts and need to re\\-link from the dashboard\\.',
    { parse_mode: 'MarkdownV2', reply_markup: keyboard },
  );
}

export async function handleUnlink(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;

  await prisma.trader.update({
    where: { id: ctx.trader.id },
    data: { telegramChatId: null, telegramAlerts: false },
  });

  await ctx.editMessageText(
    '\u{2705} Account unlinked\\.\n\nYou can re\\-link anytime with /link\\.',
    { parse_mode: 'MarkdownV2' },
  );
}
