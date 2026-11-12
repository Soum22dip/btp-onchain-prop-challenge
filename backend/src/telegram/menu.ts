// =============================================================================
// Telegram — Command & Callback Registration
// =============================================================================

import type { Bot } from 'grammy';
import type { BotContext } from './middleware.js';
import { authMiddleware } from './middleware.js';
import { mainMenuKeyboard } from './bot.js';
import { handleLinkCommand, handleLinkCode } from './link.js';
import { handleDashboard, handleRefreshDashboard, handleFullStats } from './handlers/account.js';
import { handleTradeMenu, handleCategory, handleMarketDetail, handleSideSelect, handleSizeModeSelect, handlePendingTradeInput, handleTradeConfirm, handleTradeCancel } from './handlers/trading.js';
import { handlePositions, handleCloseConfirm, handleDoClose, handleCloseAll, handleSetSlTp, handlePendingSlTpInput, handleHistory } from './handlers/positions.js';
import { handleSettings, handleToggleAlerts, handleUnlinkConfirm, handleUnlink } from './handlers/settings.js';

export function registerHandlers(bot: Bot<BotContext>): void {
  // Auth middleware — runs before all handlers except /start, /link, and link codes
  bot.use(authMiddleware);

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  bot.command('start', async (ctx) => {
    await ctx.reply(
      '\u{1F680} *Welcome to Setl8*\n\n' +
      'The world\u0027s first onchain DeFi prop firm\\.\n\n' +
      'What would you like to do?',
      { parse_mode: 'MarkdownV2', reply_markup: mainMenuKeyboard() },
    );
  });

  bot.command('link', handleLinkCommand);

  // -------------------------------------------------------------------------
  // Menu callbacks
  // -------------------------------------------------------------------------

  bot.callbackQuery('menu:main', async (ctx) => {
    await ctx.editMessageText(
      '\u{1F680} *Setl8 Menu*\n\nWhat would you like to do?',
      { parse_mode: 'MarkdownV2', reply_markup: mainMenuKeyboard() },
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:dashboard', async (ctx) => {
    await handleDashboard(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:trade', async (ctx) => {
    await handleTradeMenu(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:positions', async (ctx) => {
    await handlePositions(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:settings', async (ctx) => {
    await handleSettings(ctx);
    await ctx.answerCallbackQuery();
  });

  // -------------------------------------------------------------------------
  // Account callbacks
  // -------------------------------------------------------------------------

  bot.callbackQuery('account:refresh', async (ctx) => {
    await handleRefreshDashboard(ctx);
  });

  bot.callbackQuery('account:full', async (ctx) => {
    await handleFullStats(ctx);
    await ctx.answerCallbackQuery();
  });

  // -------------------------------------------------------------------------
  // Trading callbacks
  // -------------------------------------------------------------------------

  bot.callbackQuery(/^trade:category:/, async (ctx) => {
    await handleCategory(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^trade:market:/, async (ctx) => {
    await handleMarketDetail(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^trade:(long|short|limit|limitlong|limitshort):/, async (ctx) => {
    await handleSideSelect(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^trade:sizemode:/, async (ctx) => {
    await handleSizeModeSelect(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^trade:confirm:/, async (ctx) => {
    await handleTradeConfirm(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^trade:cancel:/, async (ctx) => {
    await handleTradeCancel(ctx);
    await ctx.answerCallbackQuery();
  });

  // -------------------------------------------------------------------------
  // Position callbacks
  // -------------------------------------------------------------------------

  bot.callbackQuery(/^pos:close:/, async (ctx) => {
    await handleCloseConfirm(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^pos:doclose:/, async (ctx) => {
    await handleDoClose(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('pos:closeall', async (ctx) => {
    await handleCloseAll(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^pos:(sl|tp):/, async (ctx) => {
    await handleSetSlTp(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('pos:history', async (ctx) => {
    await handleHistory(ctx);
    await ctx.answerCallbackQuery();
  });

  // -------------------------------------------------------------------------
  // Settings callbacks
  // -------------------------------------------------------------------------

  bot.callbackQuery('settings:toggle_alerts', async (ctx) => {
    await handleToggleAlerts(ctx);
  });

  bot.callbackQuery('settings:unlink_confirm', async (ctx) => {
    await handleUnlinkConfirm(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('settings:unlink', async (ctx) => {
    await handleUnlink(ctx);
    await ctx.answerCallbackQuery();
  });

  // -------------------------------------------------------------------------
  // Text message handler (link codes, trade size input, SL/TP input)
  // -------------------------------------------------------------------------

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();

    // Check for 6-char link code
    if (/^[A-Z0-9]{6}$/.test(text)) {
      await handleLinkCode(ctx);
      return;
    }

    // Check for pending SL/TP input
    if (await handlePendingSlTpInput(ctx)) return;

    // Check for pending trade input (size, limit price)
    if (await handlePendingTradeInput(ctx)) return;

    // Unknown message — show menu hint
    if (ctx.trader) {
      await ctx.reply(
        'Type /start to open the menu\\.',
        { parse_mode: 'MarkdownV2' },
      );
    }
  });
}
