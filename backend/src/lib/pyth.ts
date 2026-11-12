// =============================================================================
// Setl8 Backend — Real Price Feed
// Sources:
//   1. Bybit WebSocket — crypto spot tickers + XAUT (Tether Gold) (real-time)
//      Endpoint: wss://stream.bytick.com/v5/public/spot  (geo-block bypass)
//   2. Finnhub WebSocket — forex + silver (real-time, free key)
//   3. Finnhub REST — ETF indices SPY/QQQ/DIA/IWM (polling every 30s)
// =============================================================================

import WebSocket from 'ws';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Price store
// ---------------------------------------------------------------------------

export interface PriceData {
  market: string;
  price: number;
  confidence: number;
  publishTime: number;
  change24h: number;
}

const priceStore = new Map<string, PriceData>();

// ---------------------------------------------------------------------------
// Active crypto market list — managed by marketCapFilter service via Redis.
// Controls which markets appear in the /api/markets endpoint.
// (Bybit WS subscription is fixed to BYBIT_TO_MARKET — this is display-only.)
// ---------------------------------------------------------------------------

// Initialized to empty set; marketCapFilter.initActiveMarkets() populates from Redis/SEED
let activeCryptoMarkets = new Set<string>();

export function getActiveCryptoMarkets(): string[] {
  return Array.from(activeCryptoMarkets);
}

export function setActiveCryptoMarkets(markets: string[]): void {
  activeCryptoMarkets = new Set(markets);
}

// ---------------------------------------------------------------------------
// Price listener registry (consumed by candle aggregator)
// ---------------------------------------------------------------------------

type PriceListener = (market: string, data: PriceData) => void;
const priceListeners: PriceListener[] = [];

export function registerPriceListener(fn: PriceListener): void {
  priceListeners.push(fn);
}

function notifyPriceListeners(market: string, data: PriceData): void {
  for (const fn of priceListeners) fn(market, data);
}

// ---------------------------------------------------------------------------
// Bybit WebSocket — crypto spot tickers + XAUT gold
// ---------------------------------------------------------------------------

const BYBIT_WS_URL = 'wss://stream.bytick.com/v5/public/spot';

// Bybit spot symbol → our market key
// Excluded: TURBO, TAO, ZEC, CRO — not listed on Bybit Spot
// Excluded: MATIC, FTM, RAY, MKR — confirmed not on Bybit; handled by BINANCE_FALLBACK below
export const BYBIT_TO_MARKET: Record<string, string> = {
  // Crypto — existing markets
  BTCUSDT:    'BTC',    ETHUSDT:    'ETH',    SOLUSDT:    'SOL',    BNBUSDT:    'BNB',
  XRPUSDT:    'XRP',   DOGEUSDT:   'DOGE',   ADAUSDT:    'ADA',    AVAXUSDT:   'AVAX',
  LINKUSDT:   'LINK',  DOTUSDT:    'DOT',    LTCUSDT:    'LTC',    BCHUSDT:    'BCH',
  UNIUSDT:    'UNI',   ATOMUSDT:   'ATOM',   ETCUSDT:    'ETC',    APTUSDT:    'APT',
  OPUSDT:     'OP',    ARBUSDT:    'ARB',    SUIUSDT:    'SUI',
  SEIUSDT:    'SEI',   TIAUSDT:    'TIA',    INJUSDT:    'INJ',
  NEARUSDT:   'NEAR',  PEPEUSDT:   'PEPE',   WIFUSDT:    'WIF',    JUPUSDT:    'JUP',
  BONKUSDT:   'BONK',  RENDERUSDT: 'RENDER', FETUSDT:    'FET',
  GRTUSDT:    'GRT',   SNXUSDT:    'SNX',    AAVEUSDT:   'AAVE',
  COMPUSDT:   'COMP',  LDOUSDT:    'LDO',    STXUSDT:    'STX',    RUNEUSDT:   'RUNE',
  WLDUSDT:    'WLD',   JTOUSDT:    'JTO',    PYTHUSDT:   'PYTH',   ONDOUSDT:   'ONDO',
  ENAUSDT:    'ENA',   EIGENUSDT:  'EIGEN',  NOTUSDT:    'NOT',
  // Gold (Tether Gold — tracks spot gold 1:1)
  XAUTUSDT:   'XAU',
  // New markets
  TRXUSDT:    'TRX',   HYPEUSDT:   'HYPE',   HBARUSDT:   'HBAR',   SHIBUSDT:   'SHIB',
  TONUSDT:    'TON',   MNTUSDT:    'MNT',    ICPUSDT:    'ICP',    POLUSDT:    'POL',
  KASUSDT:    'KAS',   QNTUSDT:    'QNT',    ALGOUSDT:   'ALGO',   TRUMPUSDT:  'TRUMP',
  FILUSDT:    'FIL',   ZROUSDT:    'ZRO',    VETUSDT:    'VET',
};

// ---------------------------------------------------------------------------
// Binance fallback — markets not on Bybit Spot, polled from Binance mirror
// data-api.binance.vision bypasses India geo-block (same as original approach)
// ---------------------------------------------------------------------------

const BINANCE_BASE = 'https://data-api.binance.vision';

const BINANCE_FALLBACK: Record<string, string> = {
  MATICUSDT: 'MATIC', // Polygon (legacy name still on Binance)
  FTMUSDT:   'FTM',
  RAYUSDT:   'RAY',
  MKRUSDT:   'MKR',
};

async function fetchBinanceFallback(): Promise<void> {
  try {
    const symbols = Object.keys(BINANCE_FALLBACK);
    const url =
      `${BINANCE_BASE}/api/v3/ticker/24hr?symbols=` +
      encodeURIComponent(JSON.stringify(symbols));
    const res = await fetch(url);
    if (!res.ok) return;
    const data = (await res.json()) as Array<{
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
    }>;
    for (const item of data) {
      const market = BINANCE_FALLBACK[item.symbol];
      if (!market) continue;
      const price = parseFloat(item.lastPrice);
      if (!price || price <= 0) continue;
      const d: PriceData = {
        market,
        price,
        confidence: price * 0.0001,
        publishTime: Date.now(),
        change24h: parseFloat(item.priceChangePercent),
      };
      priceStore.set(market, d);
      notifyPriceListeners(market, d);
    }
  } catch {
    // ignore — stale prices better than crash
  }
}

// Market key → Bybit symbol (for candle / klines requests)
export const MARKET_TO_BYBIT: Record<string, string> = Object.fromEntries(
  Object.entries(BYBIT_TO_MARKET).map(([bybit, market]) => [market, bybit]),
);

function connectBybit(): void {
  const ws = new WebSocket(BYBIT_WS_URL);
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  ws.on('open', () => {
    logger.info('Bybit WS connected');

    // Subscribe in batches of 10, with 100ms delay between batches to avoid
    // Bybit silently dropping subscription messages under rapid-fire load.
    const topics = Object.keys(BYBIT_TO_MARKET).map((sym) => `tickers.${sym}`);
    const sendBatch = (idx: number): void => {
      if (idx >= topics.length) return;
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ op: 'subscribe', args: topics.slice(idx, idx + 10) }));
      setTimeout(() => sendBatch(idx + 10), 100);
    };
    sendBatch(0);

    // Keep-alive ping every 20s
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, 20_000);
  });

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        topic?: string;
        data?: { lastPrice: string; price24hPcnt?: string };
        op?: string;
      };

      if (!msg.topic?.startsWith('tickers.') || !msg.data) return;

      const bybitSymbol = msg.topic.slice(8); // 'tickers.BTCUSDT' → 'BTCUSDT'
      const market = BYBIT_TO_MARKET[bybitSymbol];
      if (!market) return;

      const price = parseFloat(msg.data.lastPrice);
      if (!price || price <= 0) return;

      const data: PriceData = {
        market,
        price,
        confidence: price * 0.0001,
        publishTime: Date.now(),
        change24h: parseFloat(msg.data.price24hPcnt ?? '0') * 100,
      };

      priceStore.set(market, data);
      notifyPriceListeners(market, data);
    } catch {
      // ignore malformed messages
    }
  });

  ws.on('close', () => {
    if (pingInterval) clearInterval(pingInterval);
    logger.warn('Bybit WS disconnected, reconnecting in 5s...');
    setTimeout(connectBybit, 5000);
  });

  ws.on('error', () => {
    ws.terminate();
  });
}

// ---------------------------------------------------------------------------
// Finnhub WebSocket (forex + silver)
// ---------------------------------------------------------------------------

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd71dinhr01qot5jd175gd71dinhr01qot5jd1760';

const FINNHUB_WS_SYMBOLS: Record<string, string> = {
  // Forex (OANDA)
  'OANDA:EUR_USD': 'EUR_USD',
  'OANDA:GBP_USD': 'GBP_USD',
  'OANDA:USD_JPY': 'USD_JPY',
  'OANDA:AUD_USD': 'AUD_USD',
  'OANDA:USD_CAD': 'USD_CAD',
  'OANDA:USD_CHF': 'USD_CHF',
  'OANDA:NZD_USD': 'NZD_USD',
  'OANDA:EUR_GBP': 'EUR_GBP',
  'OANDA:EUR_JPY': 'EUR_JPY',
  'OANDA:GBP_JPY': 'GBP_JPY',
  'OANDA:EUR_CHF': 'EUR_CHF',
  'OANDA:AUD_JPY': 'AUD_JPY',
  'OANDA:USD_MXN': 'USD_MXN',
  'OANDA:USD_SGD': 'USD_SGD',
  // Silver (via OANDA on Finnhub)
  'OANDA:XAG_USD': 'XAG',
};

function connectFinnhub(): void {
  const ws = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);

  ws.on('open', () => {
    logger.info('Finnhub WS connected');
    for (const symbol of Object.keys(FINNHUB_WS_SYMBOLS)) {
      ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  });

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        type: string;
        data?: Array<{ s: string; p: number; t: number }>;
      };

      if (msg.type !== 'trade' || !msg.data) return;

      for (const trade of msg.data) {
        const market = FINNHUB_WS_SYMBOLS[trade.s];
        if (!market) continue;

        const data: PriceData = {
          market,
          price: trade.p,
          confidence: trade.p * 0.0001,
          publishTime: trade.t,
          change24h: 0,
        };

        priceStore.set(market, data);
        notifyPriceListeners(market, data);
      }
    } catch {
      // ignore
    }
  });

  ws.on('close', () => {
    logger.warn('Finnhub disconnected, reconnecting in 5s...');
    setTimeout(connectFinnhub, 5000);
  });

  ws.on('error', () => {
    ws.terminate();
  });
}

// ---------------------------------------------------------------------------
// Finnhub REST — ETF indices (free tier supports REST quotes, not WS)
// ---------------------------------------------------------------------------

const ETF_SYMBOLS = ['SPY', 'QQQ', 'DIA', 'IWM'];

async function fetchEtfPrices(): Promise<void> {
  for (const symbol of ETF_SYMBOLS) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      );
      if (!res.ok) continue;
      const raw = (await res.json()) as { c: number; dp: number; t: number };
      if (!raw.c || raw.c === 0) continue;

      const data: PriceData = {
        market: symbol,
        price: raw.c,
        confidence: raw.c * 0.0001,
        publishTime: raw.t ? raw.t * 1000 : Date.now(),
        change24h: raw.dp ?? 0,
      };

      priceStore.set(symbol, data);
      notifyPriceListeners(symbol, data);
    } catch {
      // ignore individual failures
    }
  }
  logger.info(`ETF prices updated — ${ETF_SYMBOLS.length} indices`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getLatestPrices(): PriceData[] {
  return Array.from(priceStore.values());
}

export function getPrice(market: string): PriceData | undefined {
  return priceStore.get(market);
}

let etfInterval: ReturnType<typeof setInterval> | null = null;
let binanceFallbackInterval: ReturnType<typeof setInterval> | null = null;

export async function initPriceFeed(): Promise<void> {
  logger.info('Starting real price feeds...');

  // 1. Bybit WebSocket (crypto + gold) — real-time
  connectBybit();

  // 2. Binance REST fallback — MATIC, FTM, RAY, MKR (not on Bybit Spot)
  await fetchBinanceFallback();
  binanceFallbackInterval = setInterval(() => void fetchBinanceFallback(), 5_000);

  // 3. Finnhub WebSocket (forex + silver) — real-time
  connectFinnhub();

  // 4. Finnhub REST for ETF indices every 30 seconds
  await fetchEtfPrices();
  etfInterval = setInterval(() => void fetchEtfPrices(), 30_000);

  // Wait for initial prices (3s — Bybit WS delivers snapshot immediately on subscribe)
  await new Promise((r) => setTimeout(r, 3000));

  logger.info(`Price feed ready — ${priceStore.size} markets loaded`);
}

export function stopPriceFeed(): void {
  if (etfInterval) {
    clearInterval(etfInterval);
    etfInterval = null;
  }
  if (binanceFallbackInterval) {
    clearInterval(binanceFallbackInterval);
    binanceFallbackInterval = null;
  }
}
