// =============================================================================
// Setl8 Backend — Market Cap Filter Service
//
// Every 3 hours:
//   1. Fetch top 500 coins by market cap from CoinGecko (free, no key)
//   2. Filter to coins with market_cap > $1 B
//   3. Cross-reference with available Bybit spot USDT pairs
//   4. Auto-list / auto-delist crypto markets in Redis
//   5. Update the Bybit price feed mapping
//
// Non-crypto markets (forex, metals, indices) are always active.
// =============================================================================

import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import {
  getActiveCryptoMarkets,
  setActiveCryptoMarkets,
} from '../lib/pyth.js';

// ---------------------------------------------------------------------------
// Redis key
// ---------------------------------------------------------------------------

const REDIS_KEY = 'markets:active_crypto';

// ---------------------------------------------------------------------------
// Hardcoded seed — used on first boot if Redis is empty
// Markets are limited to those available on Bybit Spot (USDT pairs)
// ---------------------------------------------------------------------------

const SEED_MARKETS: string[] = [
  // Original markets (TAO and TURBO removed — not on Bybit Spot)
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX',
  'LINK', 'DOT', 'LTC', 'BCH', 'UNI', 'ATOM', 'ETC', 'APT',
  'OP', 'ARB', 'MATIC', 'SUI', 'SEI', 'TIA', 'INJ', 'FTM',
  'NEAR', 'PEPE', 'WIF', 'JUP', 'BONK', 'RAY', 'RENDER', 'FET',
  'GRT', 'SNX', 'AAVE', 'MKR', 'COMP', 'LDO', 'STX', 'RUNE',
  'WLD', 'JTO', 'PYTH', 'ONDO', 'ENA', 'EIGEN', 'NOT',
  // New markets (all confirmed on Bybit Spot)
  'TRX', 'HYPE', 'HBAR', 'SHIB', 'TON', 'MNT', 'ICP', 'POL',
  'KAS', 'QNT', 'ALGO', 'TRUMP', 'FIL', 'ZRO', 'VET',
];

// ---------------------------------------------------------------------------
// CoinGecko types
// ---------------------------------------------------------------------------

interface CoinGeckoEntry {
  id: string;
  symbol: string;
  market_cap: number;
}

// ---------------------------------------------------------------------------
// Fetch Bybit spot tickers to get all valid USDT pairs
// ---------------------------------------------------------------------------

async function fetchBybitUsdtSymbols(): Promise<Set<string>> {
  const res = await fetch('https://api.bybit.nl/v5/market/tickers?category=spot');
  if (!res.ok) throw new Error(`Bybit tickers: ${res.status}`);
  const data = (await res.json()) as {
    retCode: number;
    result: { list: Array<{ symbol: string }> };
  };
  if (data.retCode !== 0) throw new Error(`Bybit tickers retCode ${data.retCode}`);
  const symbols = new Set<string>();
  for (const item of data.result.list) {
    if (item.symbol.endsWith('USDT')) {
      // "BTCUSDT" → "BTC"
      symbols.add(item.symbol.slice(0, -4).toUpperCase());
    }
  }
  return symbols;
}

// ---------------------------------------------------------------------------
// Fetch CoinGecko top coins (2 pages = 500 coins)
// ---------------------------------------------------------------------------

async function fetchCoinGeckoTop500(): Promise<CoinGeckoEntry[]> {
  const results: CoinGeckoEntry[] = [];

  for (const page of [1, 2]) {
    const url =
      `https://api.coingecko.com/api/v3/coins/markets` +
      `?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`;

    const res = await fetch(url);
    if (!res.ok) {
      logger.warn(`CoinGecko page ${page} failed: ${res.status}`);
      continue;
    }

    const data = (await res.json()) as CoinGeckoEntry[];
    results.push(...data);

    // Rate-limit: wait 1.5 s between pages (CoinGecko free tier: 10-30 req/min)
    if (page === 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Core: run the filter
// ---------------------------------------------------------------------------

const MIN_MARKET_CAP = 1_000_000_000; // $1 B

export async function runMarketCapFilter(): Promise<void> {
  logger.info('[market-cap-filter] Starting market cap scan...');

  // 1. Fetch CoinGecko data + Bybit valid pairs in parallel
  const [coins, bybitPairs] = await Promise.all([
    fetchCoinGeckoTop500(),
    fetchBybitUsdtSymbols(),
  ]);

  if (coins.length === 0) {
    logger.warn('[market-cap-filter] CoinGecko returned 0 coins — skipping');
    return;
  }

  // 2. Filter: market_cap > $1 B AND has Bybit spot USDT pair
  const qualifying = new Set<string>();
  for (const coin of coins) {
    if (coin.market_cap < MIN_MARKET_CAP) continue;

    const ticker = coin.symbol.toUpperCase();
    if (bybitPairs.has(ticker)) {
      qualifying.add(ticker);
    }
  }

  // 3. Diff against current active list
  const currentActive = new Set(getActiveCryptoMarkets());
  const added: string[] = [];
  const removed: string[] = [];

  for (const m of qualifying) {
    if (!currentActive.has(m)) added.push(m);
  }
  for (const m of currentActive) {
    if (!qualifying.has(m)) removed.push(m);
  }

  // 4. Apply changes
  const newList = Array.from(qualifying).sort();
  setActiveCryptoMarkets(newList);
  await redis.set(REDIS_KEY, JSON.stringify(newList));

  logger.info(
    `[market-cap-filter] added ${added.length}, removed ${removed.length}, total ${newList.length} active crypto markets`,
  );
  if (added.length > 0) logger.info(`[market-cap-filter] + ${added.join(', ')}`);
  if (removed.length > 0) logger.info(`[market-cap-filter] - ${removed.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Boot: seed Redis if empty, load into price feed
// ---------------------------------------------------------------------------

export async function initActiveMarkets(): Promise<void> {
  const cached = await redis.get(REDIS_KEY);

  if (cached) {
    const markets = JSON.parse(cached) as string[];
    setActiveCryptoMarkets(markets);
    logger.info(`[market-cap-filter] Loaded ${markets.length} active crypto markets from Redis`);
  } else {
    // First boot — seed from hardcoded list
    setActiveCryptoMarkets(SEED_MARKETS);
    await redis.set(REDIS_KEY, JSON.stringify(SEED_MARKETS));
    logger.info(`[market-cap-filter] Seeded Redis with ${SEED_MARKETS.length} default crypto markets`);
  }
}

// ---------------------------------------------------------------------------
// Read active list (for /api/markets endpoint)
// ---------------------------------------------------------------------------

export function getActiveMarketList(): string[] {
  return getActiveCryptoMarkets();
}
