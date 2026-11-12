// =============================================================================
// Telegram — Trading Flow Handlers
// =============================================================================

import { InlineKeyboard } from 'grammy';
import { randomBytes } from 'node:crypto';
import type { BotContext } from '../middleware.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { marketService } from '../../synthetic/market.js';
import { positionService } from '../../synthetic/positions.js';
import { formatUsd, formatMarket, formatPrice, escapeMarkdown } from '../formatters.js';
import { mainMenuKeyboard, backToMenuKeyboard } from '../bot.js';
import { MARKET_CATEGORY, MAX_LEVERAGE, POSITION_FEE_RATE, MarketCategory } from '@setl8/constants';
import { Market, PositionSide } from '@setl8/types';

const PENDING_PREFIX = 'telegram:pending:';
const CONFIRM_PREFIX = 'telegram:confirm:';
const FOREX_LOT_SIZE = 100000;

// ---------------------------------------------------------------------------
// Trade categories
// ---------------------------------------------------------------------------

const CATEGORY_MARKETS: Record<string, Market[]> = {
  crypto: Object.entries(MARKET_CATEGORY)
    .filter(([, cat]) => cat === 'CRYPTO')
    .map(([m]) => m as Market),
  forex: Object.entries(MARKET_CATEGORY)
    .filter(([, cat]) => cat === 'FOREX')
    .map(([m]) => m as Market),
  metals: Object.entries(MARKET_CATEGORY)
    .filter(([, cat]) => cat === 'METALS')
    .map(([m]) => m as Market),
  indices: Object.entries(MARKET_CATEGORY)
    .filter(([, cat]) => cat === 'INDICES')
    .map(([m]) => m as Market),
};

// ---------------------------------------------------------------------------
// Category selection
// ---------------------------------------------------------------------------

export async function handleTradeMenu(ctx: BotContext): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('\u{1F7E1} Crypto', 'trade:category:crypto')
    .text('\u{1F4B1} Forex', 'trade:category:forex')
    .row()
    .text('\u{1F947} Metals', 'trade:category:metals')
    .text('\u{1F4CA} Indices', 'trade:category:indices')
    .row()
    .text('\u{2B05}\u{FE0F} Menu', 'menu:main');

  const text = '\u{1F4C8} *Trade*\n\nSelect a market category:';

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  }
}

// ---------------------------------------------------------------------------
// Market list for a category
// ---------------------------------------------------------------------------

export async function handleCategory(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data ?? '';
  const category = data.replace('trade:category:', '');
  const markets = CATEGORY_MARKETS[category] ?? [];

  if (markets.length === 0) {
    await ctx.answerCallbackQuery({ text: 'No markets in this category' });
    return;
  }

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < markets.length; i++) {
    keyboard.text(markets[i], `trade:market:${markets[i]}`);
    if ((i + 1) % 3 === 0) keyboard.row();
  }
  keyboard.row().text('\u{2B05}\u{FE0F} Back', 'menu:trade');

  const label = category.charAt(0).toUpperCase() + category.slice(1);
  await ctx.editMessageText(
    `\u{1F4C8} *${escapeMarkdown(label)} Markets*\n\nTap a market to trade:`,
    { parse_mode: 'MarkdownV2', reply_markup: keyboard },
  );
}

// ---------------------------------------------------------------------------
// Market detail (price + long/short buttons)
// ---------------------------------------------------------------------------

export async function handleMarketDetail(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data ?? '';
  const market = data.replace('trade:market:', '') as Market;

  const priceData = marketService.getPrice(market);
  const price = priceData?.price ?? 0;
  const leverage = MAX_LEVERAGE[market] ?? 50;

  const text =
    `\u{1F4B9} *${formatMarket(market)}*\n\n` +
    `Price: ${formatPrice(price, market)}\n` +
    `Leverage: ${escapeMarkdown(`${leverage}x`)}`;

  const keyboard = new InlineKeyboard()
    .text('\u{1F7E2} Long', `trade:long:${market}`)
    .text('\u{1F534} Short', `trade:short:${market}`)
    .row()
    .text('\u{1F4CB} Limit Order', `trade:limit:${market}`)
    .row()
    .text('\u{2B05}\u{FE0F} Back', `trade:category:${(MARKET_CATEGORY[market] ?? 'CRYPTO').toLowerCase()}`);

  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
}

// ---------------------------------------------------------------------------
// Long / Short — ask for size
// ---------------------------------------------------------------------------

export async function handleSideSelect(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;
  const data = ctx.callbackQuery?.data ?? '';
  // trade:long:BTC or trade:short:BTC or trade:limit:BTC
  const parts = data.split(':');
  const sideOrLimit = parts[1]; // 'long', 'short', 'limit'
  const market = parts[2] as Market;

  const attempt = await prisma.attempt.findFirst({
    where: { traderId: ctx.trader.id, status: 'ACTIVE' },
    select: { currentBalance: true },
  });

  if (!attempt) {
    await ctx.editMessageText(
      '\u{274C} No active challenge\\. Buy one at setl8\\.com/challenge',
      { parse_mode: 'MarkdownV2', reply_markup: backToMenuKeyboard() },
    );
    return;
  }

  const chatId = String(ctx.chat?.id ?? '');
  const balance = Number(attempt.currentBalance);

  if (sideOrLimit === 'limit') {
    // For limit orders, first ask for side
    const keyboard = new InlineKeyboard()
      .text('\u{1F7E2} Buy Limit', `trade:limitlong:${market}`)
      .text('\u{1F534} Sell Limit', `trade:limitshort:${market}`)
      .row()
      .text('\u{2B05}\u{FE0F} Back', `trade:market:${market}`);

    await ctx.editMessageText(
      `\u{1F4CB} *Limit Order \\- ${formatMarket(market)}*\n\nSelect side:`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
    return;
  }

  // Determine side from callback
  let side: 'Long' | 'Short';
  let orderType: 'MARKET' | 'LIMIT' = 'MARKET';

  if (sideOrLimit === 'long' || sideOrLimit === 'limitlong') {
    side = 'Long';
    if (sideOrLimit === 'limitlong') orderType = 'LIMIT';
  } else {
    side = 'Short';
    if (sideOrLimit === 'limitshort') orderType = 'LIMIT';
  }

  // Store pending trade state in Redis — waiting for size mode selection
  const pending = JSON.stringify({ market, side, orderType, step: 'sizeMode' });
  await redis.setex(`${PENDING_PREFIX}${chatId}`, 120, pending);

  const isForex = MARKET_CATEGORY[market] === MarketCategory.FOREX;
  const keyboard = new InlineKeyboard()
    .text('\u{1F4B5} USD', 'trade:sizemode:USD')
    .text(isForex ? '\u{1F4CA} Lot' : `\u{1F4CA} ${market}`, `trade:sizemode:${isForex ? 'LOT' : 'ASSET'}`)
    .row()
    .text('\u{2B05}\u{FE0F} Back', `trade:market:${market}`);

  await ctx.editMessageText(
    `*${formatMarket(market)} ${escapeMarkdown(side.toUpperCase())}*\n\n` +
    `Balance: ${formatUsd(balance)}\n\n` +
    `Choose size input mode:`,
    { parse_mode: 'MarkdownV2', reply_markup: keyboard },
  );
}

// ---------------------------------------------------------------------------
// Size mode selection — USD / ASSET / LOT
// ---------------------------------------------------------------------------

export async function handleSizeModeSelect(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;
  const data = ctx.callbackQuery?.data ?? '';
  const sizeMode = data.replace('trade:sizemode:', ''); // USD, ASSET, or LOT
  const chatId = String(ctx.chat?.id ?? '');

  const raw = await redis.get(`${PENDING_PREFIX}${chatId}`);
  if (!raw) {
    await ctx.answerCallbackQuery({ text: 'Session expired. Start over.' });
    return;
  }

  const pending = JSON.parse(raw);
  pending.sizeMode = sizeMode;
  pending.step = 'size';
  await redis.setex(`${PENDING_PREFIX}${chatId}`, 120, JSON.stringify(pending));

  let prompt: string;
  if (sizeMode === 'USD') {
    prompt = `Enter position size in *USD*\\:\n\nMin: ${formatUsd(10, 0)}`;
  } else if (sizeMode === 'LOT') {
    prompt = `Enter position size in *lots*\\:\n\n1 lot \\= 100,000 units\n0\\.1 \\= mini lot\n0\\.01 \\= micro lot`;
  } else {
    const market = pending.market as Market;
    prompt = `Enter position size in *${escapeMarkdown(market)}*\\:\n\ne\\.g\\. 0\\.5 for 0\\.5 ${escapeMarkdown(market)}`;
  }

  await ctx.editMessageText(prompt, { parse_mode: 'MarkdownV2' });
}

// ---------------------------------------------------------------------------
// Handle text messages (size input, limit price input)
// ---------------------------------------------------------------------------

export async function handlePendingTradeInput(ctx: BotContext): Promise<boolean> {
  if (!ctx.trader || !ctx.message?.text) return false;
  const chatId = String(ctx.chat?.id ?? '');

  const raw = await redis.get(`${PENDING_PREFIX}${chatId}`);
  if (!raw) return false;

  const pending = JSON.parse(raw) as {
    market: Market;
    side: string;
    orderType: string;
    step: string;
    size?: number;
    sizeMode?: string;
  };

  const input = ctx.message.text.trim();

  if (pending.step === 'size') {
    const rawSize = Number(input.replace(/[$,]/g, ''));
    const sizeMode = pending.sizeMode || 'USD';

    let sizeUsd: number;
    if (sizeMode === 'USD') {
      sizeUsd = rawSize;
    } else if (sizeMode === 'LOT') {
      sizeUsd = rawSize * FOREX_LOT_SIZE;
    } else {
      const priceData = marketService.getPrice(pending.market);
      const price = priceData?.price ?? 0;
      if (price <= 0) {
        await ctx.reply('Price unavailable\\. Try again\\.', { parse_mode: 'MarkdownV2' });
        return true;
      }
      sizeUsd = rawSize * price;
    }

    if (isNaN(sizeUsd) || sizeUsd < 10) {
      const minLabel = sizeMode === 'USD' ? '$10' : sizeMode === 'LOT' ? '0.01 lots' : 'equivalent of $10';
      await ctx.reply(`Please enter a valid amount \\(min ${escapeMarkdown(minLabel)}\\)`, { parse_mode: 'MarkdownV2' });
      return true;
    }

    sizeUsd = Math.round(sizeUsd * 100) / 100;

    if (pending.orderType === 'LIMIT') {
      // Need limit price next
      pending.size = sizeUsd;
      pending.step = 'limitPrice';
      await redis.setex(`${PENDING_PREFIX}${chatId}`, 120, JSON.stringify(pending));
      await ctx.reply(
        `Enter limit price for *${formatMarket(pending.market)}*:`,
        { parse_mode: 'MarkdownV2' },
      );
      return true;
    }

    // Market order — show confirmation
    await showConfirmation(ctx, pending.market, pending.side, sizeUsd, 'MARKET');
    await redis.del(`${PENDING_PREFIX}${chatId}`);
    return true;
  }

  if (pending.step === 'limitPrice') {
    const limitPrice = Number(input.replace(/[$,]/g, ''));
    if (isNaN(limitPrice) || limitPrice <= 0) {
      await ctx.reply('Please enter a valid price', { parse_mode: 'MarkdownV2' });
      return true;
    }

    await showConfirmation(ctx, pending.market, pending.side, pending.size!, 'LIMIT', limitPrice);
    await redis.del(`${PENDING_PREFIX}${chatId}`);
    return true;
  }

  return false;
}

async function showConfirmation(
  ctx: BotContext,
  market: Market,
  side: string,
  size: number,
  orderType: string,
  limitPrice?: number,
): Promise<void> {
  const priceData = marketService.getPrice(market);
  const entryPrice = limitPrice ?? priceData?.price ?? 0;
  const leverage = MAX_LEVERAGE[market] ?? 50;
  const fee = Math.max(size, 10000) * POSITION_FEE_RATE; // estimate with min account size

  const confirmId = randomBytes(4).toString('hex');
  const confirmData = JSON.stringify({ market, side, size, orderType, limitPrice });
  await redis.setex(`${CONFIRM_PREFIX}${confirmId}`, 60, confirmData);

  const sideEmoji = side === 'Long' ? '\u{1F4C8}' : '\u{1F4C9}';
  const typeLabel = orderType === 'LIMIT' ? ' LIMIT' : '';

  const text =
    `${sideEmoji} *${escapeMarkdown(side.toUpperCase())}${escapeMarkdown(typeLabel)} ${formatMarket(market)}*\n\n` +
    `Size: ${formatUsd(size)}\n` +
    `${orderType === 'LIMIT' ? 'Limit' : 'Entry'}: ${escapeMarkdown('~')}${formatPrice(entryPrice, market)}\n` +
    `Leverage: ${escapeMarkdown(`${leverage}x`)}\n` +
    `Est\\. fee: ${formatUsd(fee)}`;

  const keyboard = new InlineKeyboard()
    .text('\u{2705} Confirm', `trade:confirm:${confirmId}`)
    .text('\u{274C} Cancel', `trade:cancel:${confirmId}`);

  await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
}

// ---------------------------------------------------------------------------
// Confirm / cancel trade
// ---------------------------------------------------------------------------

export async function handleTradeConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.trader) return;
  const data = ctx.callbackQuery?.data ?? '';
  const confirmId = data.replace('trade:confirm:', '');

  const raw = await redis.get(`${CONFIRM_PREFIX}${confirmId}`);
  if (!raw) {
    await ctx.answerCallbackQuery({ text: 'Order expired. Try again.' });
    return;
  }

  const trade = JSON.parse(raw) as {
    market: Market;
    side: string;
    size: number;
    orderType: string;
    limitPrice?: number;
  };

  await redis.del(`${CONFIRM_PREFIX}${confirmId}`);

  // Find active attempt
  const attempt = await prisma.attempt.findFirst({
    where: { traderId: ctx.trader.id, status: 'ACTIVE' },
    select: { id: true },
  });

  if (!attempt) {
    await ctx.editMessageText(
      '\u{274C} No active challenge\\.',
      { parse_mode: 'MarkdownV2', reply_markup: backToMenuKeyboard() },
    );
    return;
  }

  try {
    const side = trade.side === 'Long' ? PositionSide.Long : PositionSide.Short;

    if (trade.orderType === 'LIMIT' && trade.limitPrice) {
      await positionService.openLimitOrder({
        traderId: ctx.trader.id,
        attemptId: attempt.id,
        market: trade.market,
        side,
        sizeUsd: trade.size,
        limitPrice: trade.limitPrice,
      });
    } else {
      await positionService.openPosition({
        traderId: ctx.trader.id,
        attemptId: attempt.id,
        market: trade.market,
        side,
        sizeUsd: trade.size,
      });
    }

    const typeLabel = trade.orderType === 'LIMIT' ? 'Limit order placed' : 'Position opened';
    const keyboard = new InlineKeyboard()
      .text('\u{1F4CB} Positions', 'menu:positions')
      .text('\u{1F4C8} Trade More', 'menu:trade')
      .row()
      .text('\u{2B05}\u{FE0F} Menu', 'menu:main');

    await ctx.editMessageText(
      `\u{2705} *${escapeMarkdown(typeLabel)}*\n\n` +
      `${formatMarket(trade.market)} ${escapeMarkdown(trade.side.toUpperCase())} \\| Size: ${formatUsd(trade.size)}`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await ctx.editMessageText(
      `\u{274C} *Trade Failed*\n\n${escapeMarkdown(msg)}`,
      { parse_mode: 'MarkdownV2', reply_markup: backToMenuKeyboard() },
    );
  }
}

export async function handleTradeCancel(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data ?? '';
  const confirmId = data.replace('trade:cancel:', '');
  await redis.del(`${CONFIRM_PREFIX}${confirmId}`);

  await ctx.editMessageText(
    '\u{274C} Order cancelled\\.',
    { parse_mode: 'MarkdownV2', reply_markup: mainMenuKeyboard() },
  );
}
