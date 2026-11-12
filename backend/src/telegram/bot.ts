// =============================================================================
// Telegram — Bot Singleton
// =============================================================================

import { Bot, type Api, type RawApi, InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Bot instance (created lazily — only if token is configured)
// ---------------------------------------------------------------------------

let botInstance: Bot | null = null;

export function getBot(): Bot | null {
  if (!config.telegramBotToken) return null;
  if (!botInstance) {
    botInstance = new Bot(config.telegramBotToken);
    botInstance.catch((err) => {
      logger.error({ err: err.message || err }, '[telegram] Bot error caught — not crashing');
    });
  }
  return botInstance;
}

// ---------------------------------------------------------------------------
// Send message helper (safe — no-ops if bot not configured)
// ---------------------------------------------------------------------------

export async function sendMessage(
  chatId: string | number,
  text: string,
  options?: {
    reply_markup?: InlineKeyboard;
    parse_mode?: 'MarkdownV2' | 'HTML';
  },
): Promise<void> {
  const bot = getBot();
  if (!bot) return;
  try {
    await bot.api.sendMessage(chatId, text, {
      parse_mode: options?.parse_mode ?? 'MarkdownV2',
      reply_markup: options?.reply_markup,
    });
  } catch (err) {
    logger.error({ chatId, err: (err as Error).message }, '[telegram] Failed to send message');
  }
}

// ---------------------------------------------------------------------------
// Common keyboards
// ---------------------------------------------------------------------------

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('\u{1F4CA} Dashboard', 'menu:dashboard')
    .text('\u{1F4C8} Trade', 'menu:trade')
    .row()
    .text('\u{1F4CB} Positions', 'menu:positions')
    .text('\u{2699}\u{FE0F} Settings', 'menu:settings');
}

export function backToMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('\u{2B05}\u{FE0F} Menu', 'menu:main');
}
