// =============================================================================
// Telegram — Push Alert System
//
// Called from evaluator, position handlers, payout processor.
// NEVER throws — alert failures must not break core trading logic.
// =============================================================================

import { InlineKeyboard } from 'grammy';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { sendMessage } from './bot.js';
import { formatUsd, formatPnl, formatMarket, formatPrice, escapeMarkdown } from './formatters.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Alert types
// ---------------------------------------------------------------------------

export type TraderAlert =
  | { type: 'sl_hit'; position: { market: string; side: string; exitPrice: number; pnl: number } }
  | { type: 'tp_hit'; position: { market: string; side: string; exitPrice: number; pnl: number } }
  | { type: 'limit_filled'; position: { market: string; side: string; size: number; entryPrice: number } }
  | { type: 'drawdown_warning'; level: 60 | 80; balance: number; floor: number }
  | { type: 'dd_mode_switch'; newMode: 'trailing' | 'static'; peak?: number; floor?: number }
  | { type: 'account_passed'; balance: number; phase: string }
  | { type: 'account_failed'; balance: number; floor: number; reason: string }
  | { type: 'payout_processed'; amount: number; txSignature?: string }
  | { type: 'graduated' }
  | { type: 'new_phase'; phase: string; attemptNumber: number; accountSize: number }
  | { type: 'payout_queued_paused'; amount: number };

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function sendTraderAlert(traderId: string, alert: TraderAlert): Promise<void> {
  try {
    const trader = await prisma.trader.findUnique({
      where: { id: traderId },
      select: { telegramChatId: true, telegramAlerts: true },
    });

    if (!trader?.telegramChatId || !trader.telegramAlerts) return;

    const { text, keyboard } = formatAlert(alert);
    await sendMessage(trader.telegramChatId, text, { reply_markup: keyboard });
  } catch (err) {
    logger.error({ traderId, alertType: alert.type, err: (err as Error).message }, '[telegram] Alert delivery failed');
  }
}

// ---------------------------------------------------------------------------
// Format each alert type
// ---------------------------------------------------------------------------

function formatAlert(alert: TraderAlert): { text: string; keyboard: InlineKeyboard } {
  const dashboardKb = new InlineKeyboard()
    .text('\u{1F4CA} Dashboard', 'menu:dashboard')
    .text('\u{1F4CB} Positions', 'menu:positions');

  switch (alert.type) {
    case 'sl_hit': {
      const { market, side, exitPrice, pnl } = alert.position;
      return {
        text:
          `\u{1F534} *Stop Loss Hit*\n\n` +
          `${formatMarket(market)} ${escapeMarkdown(side)} closed at ${formatPrice(exitPrice, market)}\n` +
          `P\\&L: ${formatPnl(pnl)}`,
        keyboard: dashboardKb,
      };
    }

    case 'tp_hit': {
      const { market, side, exitPrice, pnl } = alert.position;
      return {
        text:
          `\u{1F7E2} *Take Profit Hit*\n\n` +
          `${formatMarket(market)} ${escapeMarkdown(side)} closed at ${formatPrice(exitPrice, market)}\n` +
          `P\\&L: ${formatPnl(pnl)}`,
        keyboard: dashboardKb,
      };
    }

    case 'limit_filled': {
      const { market, side, size, entryPrice } = alert.position;
      return {
        text:
          `\u{1F4CB} *Limit Order Filled*\n\n` +
          `${formatMarket(market)} ${escapeMarkdown(side)}\n` +
          `Size: ${formatUsd(size)} at ${formatPrice(entryPrice, market)}`,
        keyboard: dashboardKb,
      };
    }

    case 'drawdown_warning': {
      const icon = alert.level >= 80 ? '\u{1F6A8}' : '\u{26A0}\u{FE0F}';
      const label = alert.level >= 80 ? 'CRITICAL: Drawdown 80%' : 'Drawdown Warning';
      const remaining = alert.balance - alert.floor;
      return {
        text:
          `${icon} *${escapeMarkdown(label)}*\n\n` +
          `${escapeMarkdown(String(alert.level))}% of max drawdown used\n` +
          `Balance: ${formatUsd(alert.balance)} \\| Floor: ${formatUsd(alert.floor)}\n` +
          (alert.level >= 80 ? `Only ${formatUsd(remaining)} remaining\\!\n` : ''),
        keyboard: new InlineKeyboard().text('\u{1F4CA} Dashboard', 'menu:dashboard'),
      };
    }

    case 'dd_mode_switch': {
      const mode = alert.newMode === 'trailing' ? 'Trailing 4%' : 'Static 8%';
      let details = '';
      if (alert.peak) details += `Peak: ${formatUsd(alert.peak)}`;
      if (alert.floor) details += ` \\| Floor: ${formatUsd(alert.floor)}`;
      return {
        text:
          `\u{1F504} *Drawdown Mode Changed*\n\n` +
          `Now: ${escapeMarkdown(mode)}\n` +
          (details ? `${details}\n` : ''),
        keyboard: new InlineKeyboard().text('\u{1F4CA} Dashboard', 'menu:dashboard'),
      };
    }

    case 'account_passed':
      return {
        text:
          `\u{1F3C6} *PHASE PASSED\\!*\n\n` +
          `Final Balance: ${formatUsd(alert.balance)}\n` +
          `Phase: ${escapeMarkdown(alert.phase)}\n` +
          `Payout request created\\.`,
        keyboard: new InlineKeyboard().text('\u{1F4CA} Dashboard', 'menu:dashboard'),
      };

    case 'account_failed':
      return {
        text:
          `\u{1F480} *Account Liquidated*\n\n` +
          `Balance: ${formatUsd(alert.balance)} \\| Floor: ${formatUsd(alert.floor)}\n` +
          `Reason: ${escapeMarkdown(alert.reason)}`,
        keyboard: new InlineKeyboard()
          .text('\u{1F4CA} Dashboard', 'menu:dashboard')
          .url('\u{1F6D2} New Challenge', 'https://setl8.com/challenge'),
      };

    case 'payout_processed': {
      let txLine = '';
      if (alert.txSignature) {
        const url = `https://solscan.io/tx/${alert.txSignature}?cluster=devnet`;
        txLine = `\nTX: [View on Solscan](${escapeMarkdown(url)})`;
      }
      return {
        text:
          `\u{1F4B0} *Payout Processed*\n\n` +
          `${formatUsd(alert.amount)} sent${txLine}`,
        keyboard: new InlineKeyboard().text('\u{1F4CA} Dashboard', 'menu:dashboard'),
      };
    }

    case 'graduated':
      return {
        text:
          `\u{1F31F} *GRADUATED\\!*\n\n` +
          `You've completed all 6 phases\\.\n` +
          `Total earned: 40% of your account size\\.\n\n` +
          `Welcome to the next level\\.`,
        keyboard: new InlineKeyboard()
          .text('\u{1F4CA} Dashboard', 'menu:dashboard')
          .url('\u{1F310} setl8.com', 'https://setl8.com'),
      };

    case 'new_phase':
      return {
        text:
          `\u{1F680} *New Phase Started*\n\n` +
          `Phase: ${escapeMarkdown(alert.phase)}\n` +
          `Attempt \\#${alert.attemptNumber}\n` +
          `Account: ${formatUsd(alert.accountSize)}\n\n` +
          `Good luck, trader\\.`,
        keyboard: new InlineKeyboard()
          .text('\u{1F4C8} Trade', 'menu:trade')
          .text('\u{1F4CA} Dashboard', 'menu:dashboard'),
      };

    case 'payout_queued_paused':
      return {
        text:
          `\u{23F3} *Payout Queued*\n\n` +
          `${formatUsd(alert.amount)} is locked and waiting\\.\n` +
          `Processing begins when the vault launches on mainnet\\.\n\n` +
          `You'll be notified automatically when it's sent\\.`,
        keyboard: new InlineKeyboard().text('\u{1F4CA} Dashboard', 'menu:dashboard'),
      };
  }
}

// ---------------------------------------------------------------------------
// Drawdown alert dedup helper (use from evaluator)
// ---------------------------------------------------------------------------

export async function shouldSendDrawdownAlert(attemptId: string, level: 60 | 80): Promise<boolean> {
  const key = `telegram:dd_alert:${attemptId}:${level}`;
  const exists = await redis.exists(key);
  if (exists) return false;
  await redis.setex(key, 3600, '1'); // 1 hour cooldown
  return true;
}
