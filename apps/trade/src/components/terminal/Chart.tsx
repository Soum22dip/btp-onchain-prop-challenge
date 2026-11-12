'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type IPriceLine,
  type UTCTimestamp,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { PositionSide, PositionStatus } from '@setl8/types';
import { useMarketStore } from '@/store/market';
import { useAuth } from '@/hooks/useAuth';
import { usePnlStore } from '@/store/pnl';
import { getPositions } from '@/lib/api';
import { getPriceDecimals } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Extended position type matching what the API returns
interface PositionWithExtras {
  id: string;
  market: string;
  side: string;
  status: string;
  entryPrice: number;
  size: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  orderStatus?: string;
}

// ---------------------------------------------------------------------------
// Chart component — lightweight-charts with timeframe support
// ---------------------------------------------------------------------------

export default function Chart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastCandleRef = useRef<CandlestickData | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const selectedMarket = useMarketStore((s) => s.selectedMarket);
  const selectedTimeframe = useMarketStore((s) => s.selectedTimeframe);
  const priceFeed = useMarketStore((s) => s.prices[s.selectedMarket]);
  const [isLoading, setIsLoading] = useState(false);

  const { isAuthenticated } = useAuth();
  const { hasActiveAttempt } = usePnlStore();

  // Fetch open positions for price lines
  const { data: rawPositions } = useQuery({
    queryKey: ['positions'],
    queryFn: getPositions,
    refetchInterval: 5000,
    enabled: isAuthenticated && hasActiveAttempt,
  });

  // Determine decimals based on market and current price
  const priceDecimals = getPriceDecimals(priceFeed?.price ?? 0, selectedMarket);

  // Fetch candles function
  const fetchCandles = useCallback(
    async (chart: IChartApi, series: ISeriesApi<'Candlestick'>) => {
      setIsLoading(true);
      lastCandleRef.current = null;
      try {
        const res = await fetch(
          `${API_BASE}/api/candles?market=${selectedMarket}&interval=${selectedTimeframe.interval}&limit=300`,
        );
        if (!res.ok) {
          console.warn(`Failed to fetch candles: ${res.status}`);
          setIsLoading(false);
          return;
        }
        const json = (await res.json()) as {
          success: boolean;
          data?: Array<{ time: number; open: number; high: number; low: number; close: number }>;
        };
        if (!json.success || !Array.isArray(json.data) || !json.data.length) {
          setIsLoading(false);
          return;
        }
        const candles = json.data.map(
          (k): CandlestickData => ({
            time: k.time as UTCTimestamp,
            open: Number(k.open),
            high: Number(k.high),
            low: Number(k.low),
            close: Number(k.close),
          }),
        );
        series.setData(candles);
        lastCandleRef.current = candles[candles.length - 1] ?? null;
        chart.timeScale().fitContent();
      } catch (err) {
        // No candle data — chart stays empty
        console.warn('Error fetching candles:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedMarket, selectedTimeframe.interval],
  );

  // Create chart + fetch candles when market or timeframe changes
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#08080F' },
        textColor: '#888888',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      width: container.clientWidth,
      height: container.clientHeight,
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        minimumWidth: 80,
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderUpColor: '#22C55E',
      borderDownColor: '#EF4444',
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
      priceFormat: {
        type: 'price',
        precision: priceDecimals,
        minMove: 1 / Math.pow(10, priceDecimals),
      },
    });
    seriesRef.current = series;

    void fetchCandles(chart, series);

    const ro = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      priceLinesRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMarket, selectedTimeframe.interval]);

  // Update last candle with live price tick
  useEffect(() => {
    if (!priceFeed || !seriesRef.current) return;

    const now = Math.floor(Date.now() / 1000);
    const bucketSeconds = selectedTimeframe.seconds;
    const bucketTs = (Math.floor(now / bucketSeconds) * bucketSeconds) as UTCTimestamp;
    const price = Number(priceFeed.price);

    if (!Number.isFinite(price) || price <= 0) return;

    // Build the live candle properly: keep the bucket's open/high/low, open a new
    // bucket at the previous close so there are no gaps or flat one-tick candles.
    const last = lastCandleRef.current;
    let next: CandlestickData;
    if (last && Number(last.time) === Number(bucketTs)) {
      next = { time: bucketTs, open: last.open, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price };
    } else if (last && Number(bucketTs) > Number(last.time)) {
      const open = last.close;
      next = { time: bucketTs, open, high: Math.max(open, price), low: Math.min(open, price), close: price };
    } else if (!last) {
      next = { time: bucketTs, open: price, high: price, low: price, close: price };
    } else {
      return; // tick older than last candle
    }

    try {
      seriesRef.current.update(next);
      lastCandleRef.current = next;
    } catch {
      // Ignore — happens when live tick timestamp is before the last candle
    }
  }, [priceFeed, selectedTimeframe.seconds]);

  // Draw position entry / SL / TP lines
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    // Remove old price lines
    for (const line of priceLinesRef.current) {
      try { series.removePriceLine(line); } catch { /* already removed */ }
    }
    priceLinesRef.current = [];

    if (!rawPositions || !Array.isArray(rawPositions)) return;

    const positions = rawPositions as PositionWithExtras[];
    const marketPositions = positions.filter(
      (p) => p.market === selectedMarket && p.status === PositionStatus.Open && p.orderStatus !== 'PENDING',
    );

    for (const pos of marketPositions) {
      const isLong = pos.side === PositionSide.Long || pos.side === 'LONG';

      // Entry price line
      const entryLine = series.createPriceLine({
        price: Number(pos.entryPrice),
        color: isLong ? '#22C55E' : '#EF4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${isLong ? 'L' : 'S'} Entry`,
      });
      priceLinesRef.current.push(entryLine);

      // Stop loss line
      if (pos.stopLoss) {
        const slLine = series.createPriceLine({
          price: Number(pos.stopLoss),
          color: '#EF4444',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'SL',
        });
        priceLinesRef.current.push(slLine);
      }

      // Take profit line
      if (pos.takeProfit) {
        const tpLine = series.createPriceLine({
          price: Number(pos.takeProfit),
          color: '#22C55E',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'TP',
        });
        priceLinesRef.current.push(tpLine);
      }
    }
  }, [rawPositions, selectedMarket]);

  return (
    <div className="relative w-full h-full" style={{ minHeight: 200 }}>
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#08080F]/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#7C3AED]/30 border-t-[#7C3AED] rounded-full animate-spin" />
            <span className="text-xs text-white/30">Loading chart...</span>
          </div>
        </div>
      )}
      <div
        ref={chartContainerRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
