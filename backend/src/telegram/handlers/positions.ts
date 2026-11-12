// =============================================================================
// Telegram — Position Management Handlers
// =============================================================================

import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../middleware.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { marketService } from '../../synthetic/market.js';
import { positionService } from '../../synthetic/positions.js';
import { calculateUnrealizedPnl } from '../../synthetic/pnl.js';
import { formatUsd, formatPnl, formatMarket, formatPrice, escapeMarkdown } from '../formatters.js';
import { mainMenuKeyboard, backToMenuKeyboard } from '../bot.js';
import type { Market, PositionSide } from '@setl8/types';

const PENDING_PREFIX = 'telegram:pending:';

// ---------------------------------------------------------------------------
// Positions list
// ---------------------------------------------------------------------------

export async function handlePositions(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;

  const attempt = await prisma.attempt.findFirst({
    where: { traderId: ctx.trader.id, status: 'ACTIVE' },
    select: { id: true },
  });

  if (!attempt) {
    const kb = new InlineKeyboard()
      .text('\u{1F4C8} Trade', 'menu:trade')
      .text('\u{2B05}\u{FE0F} Menu', 'menu:main');
    const text = '\u{1F4CB} *Positions*\n\nNo active challenge\\.';
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: kb });
    }
    return;
  }

  const positions = await prisma.position.findMany({
    where: { attemptId: attempt.id, status: 'OPEN', orderStatus: 'FILLED' },
    orderBy: { openedAt: 'asc' },
  });

  if (positions.length === 0) {
    const kb = new InlineKeyboard()
      .text('\u{1F4C8} Trade', 'menu:trade')
      .text('\u{1F4DC} History', 'pos:history')
      .row()
      .text('\u{2B05}\u{FE0F} Menu', 'menu:main');
    const text = '\u{1F4CB} *Positions*\n\nNo open positions\\.';
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: kb });
    }
    return;
  }

  // Build position cards
  let text = '\u{1F4CB} *Open Positions*\n';
  const keyboard = new InlineKeyboard();

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const priceData = marketService.getPrice(pos.market as Market);
    const currentPrice = priceData?.price ?? Number(pos.entryPrice);
    const pnl = calculateUnrealizedPnl(
      { side: pos.side as PositionSide, entryPrice: pos.entryPrice, size: pos.remainingSize || pos.size },
      currentPrice,
    );
    const pnlPct = Number(pos.size) > 0 ? (pnl / Number(pos.size)) * 100 : 0;

    const sl = pos.stopLoss ? formatPrice(Number(pos.stopLoss), pos.market) : escapeMarkdown('—');
    const tp = pos.takeProfit ? formatPrice(Number(pos.takeProfit), pos.market) : escapeMarkdown('—');

    text +=
      `\n*${escapeMarkdown(String(i + 1))}\\. ${formatMarket(pos.market)} ${escapeMarkdown(pos.side === 'LONG' ? 'LONG' : 'SHORT')}*\n` +
      `Size: ${formatUsd(Number(pos.size))} \\| Entry: ${formatPrice(Number(pos.entryPrice), pos.market)}\n` +
      `P\\&L: ${formatPnl(pnl)} \\(${escapeMarkdown(pnlPct.toFixed(1))}%\\)\n` +
      `SL: ${sl} \\| TP: ${tp}\n`;

    keyboard
      .text(`\u{274C} Close #${i + 1}`, `pos:close:${pos.id}`)
      .text(`\u{1F6D1} SL #${i + 1}`, `pos:sl:${pos.id}`)
      .text(`\u{1F3AF} TP #${i + 1}`, `pos:tp:${pos.id}`)
      .row();
  }

  if (positions.length >= 2) {
    keyboard.text('\u{274C} Close All', 'pos:closeall');
  }
  keyboard
    .text('\u{1F4DC} History', 'pos:history')
    .text('\u{1F504} Refresh', 'menu:positions')
    .row()
    .text('\u{2B05}\u{FE0F} Menu', 'menu:main');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  }
}

// ---------------------------------------------------------------------------
// Close position
// ---------------------------------------------------------------------------

export async function handleCloseConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;
  const positionId = (ctx.callbackQuery?.data ?? '').replace('pos:close:', '');

  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: { market: true, side: true, size: true, entryPrice: true, traderId: true, status: true },
  });

  if (!position || position.traderId !== ctx.trader.id || position.status !== 'OPEN') {
    await ctx.answerCallbackQuery({ text: 'Position not found or already closed' });
    return;
  }

  const priceData = marketService.getPrice(position.market as Market);
  const currentPrice = priceData?.price ?? Number(position.entryPrice);
  const pnl = calculateUnrealizedPnl(
    { side: position.side as PositionSide, entryPrice: Number(position.entryPrice), size: Number(position.size) },
    currentPrice,
  );

  const keyboard = new InlineKeyboard()
    .text('\u{2705} Yes, Close', `pos:doclose:${positionId}`)
    .text('\u{274C} Cancel', 'menu:positions');

  await ctx.editMessageText(
    `\u{274C} *Close Position?*\n\n` +
    `${formatMarket(position.market)} ${escapeMarkdown(position.side)}\n` +
    `Size: ${formatUsd(Number(position.size))} \\| Entry: ${formatPrice(Number(position.entryPrice), position.market)}\n` +
    `Current P\\&L: ${formatPnl(pnl)}`,
    { parse_mode: 'MarkdownV2', reply_markup: keyboard },
  );
}

export async function handleDoClose(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;
  const positionId = (ctx.callbackQuery?.data ?? '').replace('pos:doclose:', '');

  try {
    const closed = await positionService.closePosition(positionId, ctx.trader.id);
    const netPnl = Number(closed.realizedPnl ?? 0);

    const keyboard = new InlineKeyboard()
      .text('\u{1F4CB} Positions', 'menu:positions')
      .text('\u{1F4C8} Trade', 'menu:trade')
      .row()
      .text('\u{2B05}\u{FE0F} Menu', 'menu:main');

    await ctx.editMessageText(
      `\u{2705} *Closed:* ${formatMarket(closed.market)} ${escapeMarkdown(closed.side)}\n` +
      `Net P\\&L: ${formatPnl(netPnl)}`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to close';
    await ctx.editMessageText(
      `\u{274C} ${escapeMarkdown(msg)}`,
      { parse_mode: 'MarkdownV2', reply_markup: backToMenuKeyboard() },
    );
  }
}

// ---------------------------------------------------------------------------
// Close all
// ---------------------------------------------------------------------------

export async function handleCloseAll(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;

  const attempt = await prisma.attempt.findFirst({
    where: { traderId: ctx.trader.id, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!attempt) return;

  const positions = await prisma.position.findMany({
    where: { attemptId: attempt.id, status: 'OPEN', orderStatus: 'FILLED' },
    select: { id: true },
  });

  let closed = 0;
  for (const pos of positions) {
    try {
      await positionService.closePosition(pos.id, ctx.trader.id);
      closed++;
    } catch { /* skip */ }
  }

  const keyboard = new InlineKeyboard()
    .text('\u{1F4CB} Positions', 'menu:positions')
    .text('\u{2B05}\u{FE0F} Menu', 'menu:main');

  await ctx.editMessageText(
    `\u{2705} Closed ${escapeMarkdown(String(closed))}/${escapeMarkdown(String(positions.length))} positions`,
    { parse_mode: 'MarkdownV2', reply_markup: keyboard },
  );
}

// ---------------------------------------------------------------------------
// Set SL / TP (text input flow)
// ---------------------------------------------------------------------------

export async function handleSetSlTp(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;
  const data = ctx.callbackQuery?.data ?? '';
  const isSl = data.startsWith('pos:sl:');
  const positionId = data.replace(/^pos:(sl|tp):/, '');
  const chatId = String(ctx.chat?.id ?? '');

  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: { market: true, side: true, entryPrice: true },
  });
  if (!position) return;

  const action = isSl ? 'setSL' : 'setTP';
  await redis.setex(
    `${PENDING_PREFIX}${chatId}`,
    120,
    JSON.stringify({ action, positionId }),
  );

  const label = isSl ? 'stop loss' : 'take profit';
  await ctx.editMessageText(
    `Enter ${escapeMarkdown(label)} price for *${formatMarket(position.market)} ${escapeMarkdown(position.side)}*\n` +
    `Entry: ${formatPrice(Number(position.entryPrice), position.market)}\n\n` +
    `Type 0 to remove the ${escapeMarkdown(label)}\\.`,
    { parse_mode: 'MarkdownV2' },
  );
}

export async function handlePendingSlTpInput(ctx: BotContext): Promise<boolean> {
  if (!ctx.trader || !ctx.message?.text) return false;
  const chatId = String(ctx.chat?.id ?? '');

  const raw = await redis.get(`${PENDING_PREFIX}${chatId}`);
  if (!raw) return false;

  const pending = JSON.parse(raw) as { action: string; positionId: string };
  if (pending.action !== 'setSL' && pending.action !== 'setTP') return false;

  const input = Number(ctx.message.text.trim().replace(/[$,]/g, ''));
  if (isNaN(input) || input < 0) {
    await ctx.reply('Please enter a valid price\\.', { parse_mode: 'MarkdownV2' });
    return true;
  }

  await redis.del(`${PENDING_PREFIX}${chatId}`);

  try {
    const sl = pending.action === 'setSL' ? (input === 0 ? null : input) : undefined;
    const tp = pending.action === 'setTP' ? (input === 0 ? null : input) : undefined;
    await positionService.updateSlTp(pending.positionId, ctx.trader.id, sl, tp);

    const label = pending.action === 'setSL' ? 'Stop loss' : 'Take profit';
    const value = input === 0 ? 'removed' : `set to ${escapeMarkdown(`$${input}`)}`;
    const keyboard = new InlineKeyboard()
      .text('\u{1F4CB} Positions', 'menu:positions')
      .text('\u{2B05}\u{FE0F} Menu', 'menu:main');

    await ctx.reply(
      `\u{2705} ${escapeMarkdown(label)} ${value}`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed';
    await ctx.reply(`\u{274C} ${escapeMarkdown(msg)}`, {
      parse_mode: 'MarkdownV2',
      reply_markup: backToMenuKeyboard(),
    });
  }

  return true;
}

// ---------------------------------------------------------------------------
// Trade history
// ---------------------------------------------------------------------------

export async function handleHistory(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;

  const attempt = await prisma.attempt.findFirst({
    where: { traderId: ctx.trader.id, status: 'ACTIVE' },
    select: { id: true },
  });

  if (!attempt) {
    await ctx.editMessageText(
      '\u{1F4DC} *Trade History*\n\nNo active challenge\\.',
      { parse_mode: 'MarkdownV2', reply_markup: backToMenuKeyboard() },
    );
    return;
  }

  const trades = await prisma.position.findMany({
    where: { attemptId: attempt.id, status: 'CLOSED', orderStatus: { not: 'CANCELLED' } },
    orderBy: { closedAt: 'desc' },
    take: 10,
    select: {
      market: true, side: true, entryPrice: true, exitPrice: true,
      realizedPnl: true, openFee: true, closeFee: true,
      openedAt: true, closedAt: true,
    },
  });

  if (trades.length === 0) {
    const kb = new InlineKeyboard()
      .text('\u{1F4CB} Positions', 'menu:positions')
      .text('\u{2B05}\u{FE0F} Menu', 'menu:main');
    await ctx.editMessageText(
      '\u{1F4DC} *Trade History*\n\nNo closed trades yet\\.',
      { parse_mode: 'MarkdownV2', reply_markup: kb },
    );
    return;
  }

  let text = '\u{1F4DC} *Trade History*\n';

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const gross = Number(t.realizedPnl ?? 0) + Number(t.closeFee ?? 0);
    const fees = Number(t.openFee ?? 0) + Number(t.closeFee ?? 0);
    const net = Number(t.realizedPnl ?? 0) - Number(t.openFee ?? 0);
    const isWin = net >= 0;
    const icon = isWin ? '\u{2705}' : '\u{274C}';

    // Duration
    let duration = '';
    if (t.closedAt && t.openedAt) {
      const ms = new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime();
      const mins = Math.floor(ms / 60000);
      if (mins < 60) duration = `${mins}m`;
      else if (mins < 1440) duration = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      else duration = `${Math.floor(mins / 1440)}d`;
    }

    text +=
      `\n${escapeMarkdown(String(i + 1))}\\. ${formatMarket(t.market)} ${escapeMarkdown(t.side)} ${icon}\n` +
      `   Entry: ${formatPrice(Number(t.entryPrice), t.market)} \\u2192 Exit: ${formatPrice(Number(t.exitPrice ?? 0), t.market)}\n` +
      `   Gross: ${formatPnl(gross)} \\| Fees: ${escapeMarkdown(`-$${fees.toFixed(2)}`)}\n` +
      `   Net: ${formatPnl(net)} \\| ${escapeMarkdown(duration)}\n`;
  }

  const keyboard = new InlineKeyboard()
    .text('\u{1F4CB} Positions', 'menu:positions')
    .text('\u{2B05}\u{FE0F} Menu', 'menu:main');

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
}
