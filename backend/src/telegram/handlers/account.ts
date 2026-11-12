// =============================================================================
// Telegram — Dashboard / Account Handlers
// =============================================================================

import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../middleware.js';
import { prisma } from '../../lib/prisma.js';
import { marketService } from '../../synthetic/market.js';
import { calculateUnrealizedPnl } from '../../synthetic/pnl.js';
import { formatUsd, formatPnl, formatPercent, escapeMarkdown } from '../formatters.js';
import { backToMenuKeyboard } from '../bot.js';
import type { Market, PositionSide } from '@setl8/types';

// ---------------------------------------------------------------------------
// Dashboard view
// ---------------------------------------------------------------------------

async function buildDashboardMessage(traderId: string) {
  const attempt = await prisma.attempt.findFirst({
    where: { traderId, status: 'ACTIVE' },
    include: {
      positions: { where: { status: 'OPEN', orderStatus: 'FILLED' } },
    },
  });

  if (!attempt) {
    return {
      text:
        '\u{1F4CA} *Dashboard*\n\n' +
        'No active challenge\\.\n' +
        'Buy one at [setl8\\.com/challenge](https://setl8.com/challenge)',
      keyboard: backToMenuKeyboard(),
    };
  }

  // Calculate unrealized P&L from live prices
  let totalUnrealizedPnl = 0;
  for (const pos of attempt.positions) {
    const priceData = marketService.getPrice(pos.market as Market);
    if (!priceData) continue;
    totalUnrealizedPnl += calculateUnrealizedPnl(
      { side: pos.side as PositionSide, entryPrice: pos.entryPrice, size: pos.remainingSize || pos.size },
      priceData.price,
    );
  }

  const startBal = Number(attempt.startingBalance);
  const currentBal = Number(attempt.currentBalance);
  const realizedPnl = Number(attempt.realizedPnl);
  const peak = Number(attempt.peakBalance);
  const floor = Number(attempt.maxDrawdownFloor);
  const target = startBal * 1.08;
  const achieved = startBal > 0 ? ((currentBal - startBal) / startBal) * 100 : 0;
  const ddMode = attempt.inTrailingMode ? 'Trailing 4%' : 'Static 8%';
  const phase = attempt.phase === 'EVALUATION' ? 'EVALUATION' : 'FUNDED';

  const text =
    `\u{1F4CA} *Dashboard*\n\n` +
    `\u{1F4B0} Balance: ${formatUsd(currentBal)}\n` +
    `\u{1F4C8} Unrealized P\\&L: ${formatPnl(totalUnrealizedPnl)}\n` +
    `\u{1F4C9} Realized P\\&L: ${formatPnl(realizedPnl)}\n\n` +
    `\u{1F3AF} Target: 8% \\(${formatUsd(target)}\\) \\u2014 ${formatPercent(achieved)} achieved\n` +
    `\u{1F6E1}\u{FE0F} DD Mode: ${escapeMarkdown(ddMode)}\n` +
    `\u{1F4CA} Phase: ${escapeMarkdown(phase)}\n\n` +
    `Open positions: ${escapeMarkdown(String(attempt.positions.length))}`;

  const keyboard = new InlineKeyboard()
    .text('\u{1F504} Refresh', 'account:refresh')
    .text('\u{1F4CA} Full Stats', 'account:full')
    .row()
    .text('\u{1F4CB} Positions', 'menu:positions')
    .text('\u{2B05}\u{FE0F} Menu', 'menu:main');

  return { text, keyboard };
}

export async function handleDashboard(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;
  const { text, keyboard } = await buildDashboardMessage(ctx.trader.id);
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    } catch (err: unknown) {
      const desc = (err as { description?: string })?.description ?? '';
      if (!desc.includes('message is not modified')) {
        throw err;
      }
    }
  } else {
    await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  }
}

export async function handleRefreshDashboard(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;
  const { text, keyboard } = await buildDashboardMessage(ctx.trader.id);
  try {
    await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  } catch {
    // Message content unchanged
  }
  await ctx.answerCallbackQuery({ text: 'Refreshed' });
}

// ---------------------------------------------------------------------------
// Full stats view
// ---------------------------------------------------------------------------

export async function handleFullStats(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;

  const attempt = await prisma.attempt.findFirst({
    where: { traderId: ctx.trader.id, status: 'ACTIVE' },
    include: {
      _count: { select: { positions: true } },
      positions: { where: { status: 'CLOSED' }, select: { realizedPnl: true } },
    },
  });

  if (!attempt) {
    try {
      await ctx.editMessageText(
        '\u{1F4CA} *Full Stats*\n\nNo active challenge\\.',
        { parse_mode: 'MarkdownV2', reply_markup: backToMenuKeyboard() },
      );
    } catch (err: unknown) {
      const desc = (err as { description?: string })?.description ?? '';
      if (!desc.includes('message is not modified')) {
        throw err;
      }
    }
    return;
  }

  const startBal = Number(attempt.startingBalance);
  const currentBal = Number(attempt.currentBalance);
  const peak = Number(attempt.peakBalance);
  const floor = Number(attempt.maxDrawdownFloor);
  const tradeStart = Number(attempt.tradeStartBalance);

  const closedPositions = attempt.positions;
  const wins = closedPositions.filter((p) => Number(p.realizedPnl ?? 0) > 0).length;
  const total = closedPositions.length;
  const winRate = total > 0 ? (wins / total) * 100 : 0;

  const openCount = attempt._count.positions - total;

  const text =
    `\u{1F4CA} *Full Account Stats*\n\n` +
    `Account tier: ${formatUsd(startBal, 0)}\n` +
    `Starting balance: ${formatUsd(startBal)}\n` +
    `Current balance: ${formatUsd(currentBal)}\n` +
    `Peak balance: ${formatUsd(peak)}\n` +
    `Drawdown floor: ${formatUsd(floor)}\n` +
    `DD mode: ${escapeMarkdown(attempt.inTrailingMode ? 'Trailing' : 'Static')}\n` +
    `Trade start balance: ${formatUsd(tradeStart)}\n\n` +
    `Phase: ${escapeMarkdown(attempt.phase)} \\| Attempt \\#${escapeMarkdown(String(attempt.attemptNumber))}\n` +
    `Status: ACTIVE\n` +
    `Started: ${escapeMarkdown(attempt.startedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}\n\n` +
    `Trades: ${escapeMarkdown(String(openCount))} open, ${escapeMarkdown(String(total))} closed\n` +
    `Win rate: ${formatPercent(winRate)} \\(${escapeMarkdown(String(wins))}/${escapeMarkdown(String(total))}\\)`;

  const keyboard = new InlineKeyboard()
    .text('\u{1F504} Refresh', 'account:full')
    .text('\u{2B05}\u{FE0F} Menu', 'menu:main');

  try {
    await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  } catch (err: unknown) {
    const desc = (err as { description?: string })?.description ?? '';
    if (!desc.includes('message is not modified')) {
      throw err;
    }
  }
}
