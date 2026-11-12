// =============================================================================
// Setl8 Backend — Candle (OHLC) Service
//
// Crypto + gold (XAU): proxy Bybit klines API   → historical data on demand
// MATIC/FTM/RAY/MKR: Binance REST candle proxy  → historical data on demand
// Non-crypto (forex, silver, indices):
//   - Warm-up on first request via Yahoo Finance (free, no key)
//   - Live updates via in-memory aggregation from price ticks
//
// Supported intervals: Bybit format
//   1, 5, 15, 30, 60, 240, D
// =============================================================================

import { registerPriceListener, MARKET_TO_BYBIT, type PriceData } from './pyth.js';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Candle {
  time: number;    // unix seconds (oldest-first)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleInterval = '1' | '5' | '15' | '30' | '60' | '240' | 'D';

const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  '1':   60,
  '5':   300,
  '15':  900,
  '30':  1800,
  '60':  3600,
  '240': 14400,
  'D':   86400,
};

// ---------------------------------------------------------------------------
// In-memory candle store for non-crypto markets (forex / silver / indices)
// ---------------------------------------------------------------------------

const MAX_CANDLES_PER_STORE = 500;

// market → interval → Candle[] (oldest first)
const candleStore = new Map<string, Map<string, Candle[]>>();

function getOrCreate(market: string, interval: string): Candle[] {
  let byInterval = candleStore.get(market);
  if (!byInterval) {
    byInterval = new Map();
    candleStore.set(market, byInterval);
  }
  let candles = byInterval.get(interval);
  if (!candles) {
    candles = [];
    byInterval.set(interval, candles);
  }
  return candles;
}

function onPriceTick(market: string, data: PriceData): void {
  // Only aggregate in-memory for markets NOT served by Bybit klines.
  // Bybit markets (crypto + gold) use real klines — no need for in-memory.
  if (MARKET_TO_BYBIT[market]) return;

  const nowSecs = Math.floor(data.publishTime / 1000);
  const price = data.price;
  const intervals: CandleInterval[] = ['1', '5', '15', '30', '60', '240', 'D'];

  for (const interval of intervals) {
    const bucketSecs = INTERVAL_SECONDS[interval];
    const bucketTime = Math.floor(nowSecs / bucketSecs) * bucketSecs;
    const candles = getOrCreate(market, interval);

    if (candles.length === 0 || candles[candles.length - 1].time < bucketTime) {
      if (candles.length >= MAX_CANDLES_PER_STORE) candles.shift();
      candles.push({ time: bucketTime, open: price, high: price, low: price, close: price, volume: 0 });
    } else {
      const c = candles[candles.length - 1];
      if (price > c.high) c.high = price;
      if (price < c.low)  c.low  = price;
      c.close = price;
    }
  }
}

export function initCandleAggregator(): void {
  registerPriceListener(onPriceTick);
  logger.info('Candle aggregator initialized (non-crypto in-memory aggregation active)');
}

// ---------------------------------------------------------------------------
// Bybit klines proxy (crypto + gold)
// ---------------------------------------------------------------------------

const BYBIT_REST = 'https://api.bybit.nl/v5';

async function fetchBybitKlines(
  bybitSymbol: string,
  interval: string,
  limit: number,
): Promise<Candle[]> {
  const url =
    `${BYBIT_REST}/market/kline?category=spot` +
    `&symbol=${bybitSymbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bybit klines HTTP ${res.status}`);

  const data = (await res.json()) as {
    retCode: number;
    retMsg: string;
    result: { list: string[][] };
  };
  if (data.retCode !== 0) throw new Error(`Bybit klines retCode ${data.retCode}: ${data.retMsg}`);

  // Bybit returns newest-first — reverse to oldest-first
  return data.result.list
    .reverse()
    .map((k) => ({
      time:   Math.floor(parseInt(k[0], 10) / 1000),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
}

// ---------------------------------------------------------------------------
// Binance REST klines proxy (MATIC / FTM / RAY / MKR — not on Bybit Spot)
// ---------------------------------------------------------------------------

const BINANCE_BASE = 'https://data-api.binance.vision';

// Markets that need Binance klines (same 4 as BINANCE_FALLBACK in pyth.ts)
const BINANCE_KLINE_MARKETS: Record<string, string> = {
  MATIC: 'MATICUSDT',
  FTM:   'FTMUSDT',
  RAY:   'RAYUSDT',
  MKR:   'MKRUSDT',
};

// Bybit interval → Binance interval
const BINANCE_INTERVAL_MAP: Partial<Record<CandleInterval, string>> = {
  '1':   '1m',
  '5':   '5m',
  '15':  '15m',
  '30':  '30m',
  '60':  '1h',
  '240': '4h',
  'D':   '1d',
};

async function fetchBinanceKlines(
  binanceSymbol: string,
  interval: CandleInterval,
  limit: number,
): Promise<Candle[]> {
  const bInterval = BINANCE_INTERVAL_MAP[interval];
  if (!bInterval) return [];

  const url =
    `${BINANCE_BASE}/api/v3/klines` +
    `?symbol=${binanceSymbol}&interval=${bInterval}&limit=${Math.min(limit, 1000)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance klines HTTP ${res.status}`);

  // Binance returns oldest-first: [openTime, open, high, low, close, volume, ...]
  const data = (await res.json()) as string[][];
  return data.map((k) => ({
    time:   Math.floor(parseInt(k[0], 10) / 1000),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

// ---------------------------------------------------------------------------
// Yahoo Finance warmup for non-crypto markets (forex, silver, indices)
// Used only on cold start — in-memory aggregation takes over after boot
// ---------------------------------------------------------------------------

// Market key → Yahoo Finance symbol
const YAHOO_SYMBOLS: Record<string, string> = {
  // Forex (all 14 pairs)
  EUR_USD: 'EURUSD=X', GBP_USD: 'GBPUSD=X', USD_JPY: 'USDJPY=X',
  AUD_USD: 'AUDUSD=X', USD_CAD: 'USDCAD=X', USD_CHF: 'USDCHF=X',
  NZD_USD: 'NZDUSD=X', EUR_GBP: 'EURGBP=X', EUR_JPY: 'EURJPY=X',
  GBP_JPY: 'GBPJPY=X', EUR_CHF: 'EURCHF=X', AUD_JPY: 'AUDJPY=X',
  USD_MXN: 'USDMXN=X', USD_SGD: 'USDSGD=X',
  // Silver — COMEX silver futures (SI=F), close to spot price
  XAG: 'SI=F',
  // ETF indices
  SPY: 'SPY', QQQ: 'QQQ', DIA: 'DIA', IWM: 'IWM',
};

// Intervals supported by Yahoo Finance warmup (1h and daily only)
// Other intervals (1m, 5m, 15m, 30m, 4h) rely purely on in-memory ticks
const YAHOO_CONFIG: Partial<Record<CandleInterval, { interval: string; range: string }>> = {
  '60': { interval: '60m', range: '1mo' },
  'D':  { interval: '1d',  range: '1y'  },
};

interface YahooResult {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low:  (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }>;
    error?: unknown;
  };
}

async function fetchYahooCandles(
  market: string,
  interval: CandleInterval,
  limit: number,
): Promise<Candle[]> {
  const ySym = YAHOO_SYMBOLS[market];
  const yCfg = YAHOO_CONFIG[interval];
  if (!ySym || !yCfg) return [];

  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${ySym}` +
      `?range=${yCfg.range}&interval=${yCfg.interval}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as YahooResult;
    const result = data.chart?.result?.[0];
    if (!result?.timestamp?.length) return [];

    const ts = result.timestamp;
    const q  = result.indicators.quote[0];
    const candles: Candle[] = [];

    for (let i = 0; i < ts.length; i++) {
      const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
      // Skip null slots (market closed, holiday)
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
    }

    // Seed in-memory store so subsequent requests skip Yahoo
    const store = getOrCreate(market, interval);
    if (store.length === 0 && candles.length > 0) {
      store.push(...candles.slice(-MAX_CANDLES_PER_STORE));
      logger.info(`[candles] Yahoo warmup: ${market} ${interval} — ${candles.length} candles loaded`);
    }

    return candles.slice(-limit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[candles] Yahoo Finance failed for ${market}: ${msg}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public: get candles for any market
// ---------------------------------------------------------------------------

export async function getCandles(
  market: string,
  interval: CandleInterval,
  limit: number,
): Promise<Candle[]> {
  // 1. Bybit klines — crypto + gold
  const bybitSymbol = MARKET_TO_BYBIT[market];
  if (bybitSymbol) {
    try {
      return await fetchBybitKlines(bybitSymbol, interval, limit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[candles] Bybit klines failed for ${market}: ${msg}`);
      return [];
    }
  }

  // 2. Binance klines — MATIC, FTM, RAY, MKR
  const binanceSymbol = BINANCE_KLINE_MARKETS[market];
  if (binanceSymbol) {
    try {
      return await fetchBinanceKlines(binanceSymbol, interval, limit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[candles] Binance klines failed for ${market}: ${msg}`);
      return [];
    }
  }

  // 3. Non-crypto: serve from in-memory store, warm up from Yahoo if cold
  const store = getOrCreate(market, interval);
  if (store.length >= Math.min(limit, 10)) {
    return store.slice(-limit);
  }

  // Cold start or insufficient data — warm up from Yahoo Finance
  return await fetchYahooCandles(market, interval, limit);
}

export const VALID_INTERVALS: CandleInterval[] = ['1', '5', '15', '30', '60', '240', 'D'];
