import React, { useRef, useEffect, useCallback } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';
import type { Market } from '@setl8/types';
import { useMarketStore } from '@/store/market';
import type { CandleData } from '@/store/market';

interface TradingChartProps {
  market: Market;
  timeframe: string;
}

const TIMEFRAME_SECONDS: Record<string, number> = {
  M1: 60, M5: 300, M15: 900, M30: 1800,
  H1: 3600, H4: 14400, D1: 86400, W1: 604800, MN: 2592000,
};

const BASE_PRICES: Partial<Record<Market, number>> = {
  BTC: 85000, ETH: 3200, SOL: 180, BNB: 600, XRP: 0.62,
  DOGE: 0.38, ADA: 0.45, AVAX: 40, LINK: 18, DOT: 8,
  LTC: 95, BCH: 350, UNI: 10, ATOM: 9, ETC: 28,
  XAU: 3200, XAG: 32,
  SPY: 590, QQQ: 510, DIA: 420, IWM: 210,
  EUR_USD: 1.085, GBP_USD: 1.265, USD_JPY: 150.5,
  AUD_USD: 0.66, USD_CAD: 1.36, USD_CHF: 0.88,
};

function generateCandles(market: Market, timeframe: string, currentPrice: number, count = 200): CandleData[] {
  const interval = TIMEFRAME_SECONDS[timeframe] ?? 3600;
  const volatility = interval < 3600 ? 0.002 : interval < 86400 ? 0.008 : 0.02;
  const now = Math.floor(Date.now() / 1000);
  const candles: CandleData[] = [];

  let price = currentPrice > 0 ? currentPrice : (BASE_PRICES[market] ?? 100);

  for (let i = count; i >= 0; i--) {
    const time = now - i * interval;
    const change = (Math.random() - 0.5) * 2 * volatility;
    const open = price;
    const close = open * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    candles.push({ time, open, high, low, close });
    price = close;
  }
  return candles;
}

const CHART_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <script src="https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #08080F; overflow: hidden; }
    #chart { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="chart"></div>
  <script>
    var chart = LightweightCharts.createChart(document.getElementById('chart'), {
      layout: { background: { color: '#08080F' }, textColor: '#888888' },
      grid: { vertLines: { color: '#222222' }, horzLines: { color: '#222222' } },
      timeScale: { borderColor: '#222222', timeVisible: true },
      rightPriceScale: { borderColor: '#222222' },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      width: window.innerWidth,
      height: window.innerHeight,
    });

    var candleSeries = chart.addCandlestickSeries({
      upColor: '#22C55E', downColor: '#EF4444',
      borderUpColor: '#22C55E', borderDownColor: '#EF4444',
      wickUpColor: '#22C55E', wickDownColor: '#EF4444',
    });

    window.addEventListener('resize', function() {
      chart.applyOptions({ width: window.innerWidth, height: window.innerHeight });
    });

    function handleMessage(data) {
      try {
        var msg = JSON.parse(data);
        if (msg.type === 'SET_DATA' && msg.candles) {
          candleSeries.setData(msg.candles);
          chart.timeScale().fitContent();
        }
        if (msg.type === 'UPDATE_PRICE' && msg.lastCandle) {
          candleSeries.update(msg.lastCandle);
        }
      } catch(e) {}
    }

    document.addEventListener('message', function(e) { handleMessage(e.data); });
    window.addEventListener('message', function(e) { handleMessage(e.data); });
  </script>
</body>
</html>`;

export function TradingChart({ market, timeframe }: TradingChartProps) {
  const webViewRef = useRef<WebView>(null);
  const price = useMarketStore((s) => s.prices[market]?.price ?? 0);

  const sendCandles = useCallback(() => {
    if (!webViewRef.current) return;
    const candles = generateCandles(market, timeframe, price);
    const json = JSON.stringify({ type: 'SET_DATA', candles });
    webViewRef.current.injectJavaScript(`handleMessage(${JSON.stringify(json)}); true;`);
  }, [market, timeframe, price]);

  useEffect(() => {
    const timer = setTimeout(sendCandles, 500);
    return () => clearTimeout(timer);
  }, [sendCandles]);

  useEffect(() => {
    if (!webViewRef.current || price <= 0) return;
    const candles = generateCandles(market, timeframe, price);
    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) return;
    const updated: CandleData = {
      ...lastCandle,
      close: price,
      high: Math.max(lastCandle.high, price),
      low: Math.min(lastCandle.low, price),
    };
    const json = JSON.stringify({ type: 'UPDATE_PRICE', lastCandle: updated });
    webViewRef.current.injectJavaScript(`handleMessage(${JSON.stringify(json)}); true;`);
  }, [price, market, timeframe]);

  return (
    <View style={{ flex: 1, backgroundColor: '#08080F' }}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: CHART_HTML }}
        style={{ flex: 1, backgroundColor: '#08080F' }}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={sendCandles}
      />
    </View>
  );
}
