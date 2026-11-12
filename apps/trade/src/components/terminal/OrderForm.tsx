'use client';

import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { MAX_LEVERAGE, MARKET_DISPLAY_NAME, POSITION_FEE_RATE, MARKET_CATEGORY, MarketCategory } from '@setl8/constants';
import type { Market } from '@setl8/types';
import { PositionSide } from '@setl8/types';
import { useMarketStore } from '@/store/market';
import { usePnlStore } from '@/store/pnl';
import { useToastStore } from '@/store/toast';
import { useAuth } from '@/hooks/useAuth';
import { openPosition } from '@/lib/api';
import { isMarketClosed, formatUsd, formatPrice, getPriceDecimals, cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// OrderForm
// ---------------------------------------------------------------------------

type SizeMode = 'USD' | 'ASSET' | 'LOT';
const FOREX_LOT_SIZE = 100000;

export const OrderForm = React.memo(function OrderForm() {
  const queryClient = useQueryClient();
  const { isAuthenticated, authFailed, signIn, walletConnected } = useAuth();

  const addToast = useToastStore((s) => s.addToast);
  const selectedMarket = useMarketStore((s) => s.selectedMarket);
  const priceFeed = useMarketStore((s) => s.prices[s.selectedMarket]);
  const entryPrice = priceFeed?.price ?? 0;

  const currentBalance = Number(usePnlStore((s) => s.currentBalance));
  const startingBalance = Number(usePnlStore((s) => s.startingBalance));

  const [side, setSide] = useState<PositionSide>(PositionSide.Long);
  const [sizeUsd, setSizeUsd] = useState(10);
  const [sizeMode, setSizeMode] = useState<SizeMode>('USD');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [showSlTp, setShowSlTp] = useState(false);
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marketClosed = isMarketClosed(selectedMarket);
  const leverage = MAX_LEVERAGE[selectedMarket as Market] ?? 50;
  const effectiveBalance = Number(currentBalance) > 0 ? Number(currentBalance) : Number(startingBalance) > 0 ? Number(startingBalance) : 10000;
  const maxSize = Math.max(Number(effectiveBalance) * leverage, 1000);
  // Backend charges max(startingBalance, size) * rate, so the estimate must use the starting balance
  const feeBase = Number(startingBalance) > 0 ? Number(startingBalance) : Number(effectiveBalance);
  const fee = Math.max(feeBase, Number(sizeUsd)) * POSITION_FEE_RATE;
  const margin = Number(sizeUsd) / leverage;
  const priceDecimals = getPriceDecimals(entryPrice, selectedMarket);
  const isLong = side === PositionSide.Long;
  const disabled = !isAuthenticated || marketClosed;

  const refPrice = orderType === 'LIMIT' && limitPrice ? Number(limitPrice) : Number(entryPrice);
  const assetQty = Number(refPrice) > 0 ? Number(sizeUsd) / Number(refPrice) : 0;

  const marketCategory = MARKET_CATEGORY[selectedMarket as Market];
  const isForex = marketCategory === MarketCategory.FOREX;
  const availableModes: SizeMode[] = isForex ? ['USD', 'LOT'] : ['USD', 'ASSET'];

  useEffect(() => {
    setSizeMode('USD');
  }, [selectedMarket]);

  function cycleSizeMode() {
    const currentIndex = availableModes.indexOf(sizeMode);
    const nextIndex = (currentIndex + 1) % availableModes.length;
    setSizeMode(availableModes[nextIndex]);
  }

  let displayValue: number;
  let displayLabel: string;
  let inputStep: string;
  if (sizeMode === 'USD') {
    displayValue = sizeUsd;
    displayLabel = 'USD';
    inputStep = '10';
  } else if (sizeMode === 'ASSET') {
    displayValue = refPrice > 0 ? sizeUsd / refPrice : 0;
    displayLabel = selectedMarket.replace('_', '/');
    inputStep = displayValue < 1 ? '0.0001' : '0.01';
  } else {
    displayValue = sizeUsd / FOREX_LOT_SIZE;
    displayLabel = 'LOT';
    inputStep = '0.01';
  }

  function handleSizeInputChange(rawValue: number) {
    let usdValue: number;
    if (sizeMode === 'USD') {
      usdValue = rawValue;
    } else if (sizeMode === 'ASSET') {
      usdValue = rawValue * refPrice;
    } else {
      usdValue = rawValue * FOREX_LOT_SIZE;
    }
    setSizeUsd(Math.max(0, Math.min(maxSize, usdValue)));
  }

  const liqPrice =
    Number(refPrice) > 0
      ? isLong
        ? Number(refPrice) * (1 - (1 / leverage) * 0.9)
        : Number(refPrice) * (1 + (1 / leverage) * 0.9)
      : 0;

  // SL/TP estimated P&L
  const slPnl = stopLoss && Number(refPrice) > 0
    ? isLong
      ? ((Number(stopLoss) - Number(refPrice)) / Number(refPrice)) * Number(sizeUsd)
      : ((Number(refPrice) - Number(stopLoss)) / Number(refPrice)) * Number(sizeUsd)
    : null;
  const tpPnl = takeProfit && Number(refPrice) > 0
    ? isLong
      ? ((Number(takeProfit) - Number(refPrice)) / Number(refPrice)) * Number(sizeUsd)
      : ((Number(refPrice) - Number(takeProfit)) / Number(refPrice)) * Number(sizeUsd)
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAuthenticated || marketClosed || isLoading) return;

    if (!sizeUsd || Number(sizeUsd) < 10) {
      setError('Minimum size is $10');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const params: Parameters<typeof openPosition>[0] = {
        market: selectedMarket,
        side,
        sizeUsd: Number(sizeUsd),
        orderType,
      };
      if (orderType === 'LIMIT' && limitPrice) {
        params.limitPrice = Number(limitPrice);
      }
      if (stopLoss) params.stopLoss = Number(stopLoss);
      if (takeProfit) params.takeProfit = Number(takeProfit);

      await openPosition(params);

      const sideLabel = isLong ? 'LONG' : 'SHORT';
      const typeLabel = orderType === 'LIMIT' ? 'Limit order placed' : 'Position opened';
      addToast(`${typeLabel}: ${MARKET_DISPLAY_NAME[selectedMarket]} ${sideLabel} ${formatUsd(Number(sizeUsd))}`, 'success');
      setSizeUsd(10);
      setStopLoss('');
      setTakeProfit('');
      setLimitPrice('');
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open position';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 gap-2.5">
      {/* Market label + live price */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-white/50">
          {MARKET_DISPLAY_NAME[selectedMarket]}
        </span>
        {Number(entryPrice) > 0 && (
          <span className="text-[11px] text-white font-mono">
            {formatPrice(Number(entryPrice), priceDecimals)}
          </span>
        )}
      </div>

      {/* Market closed banner */}
      {marketClosed && (
        <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-lg px-3 py-2 text-[11px] text-[#F59E0B]">
          Market closed — opens Monday
        </div>
      )}

      {/* Not authenticated */}
      {!isAuthenticated && (
        <div className="text-center py-2">
          {walletConnected && authFailed ? (
            <button type="button" onClick={() => void signIn()} className="text-[11px] text-[#7C3AED] hover:text-[#9b5eff] underline underline-offset-2">
              Sign in to trade
            </button>
          ) : (
            <div className="text-[11px] text-white/25">
              {walletConnected ? 'Signing in...' : 'Connect wallet to trade'}
            </div>
          )}
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-2.5">
        {/* BUY / SELL toggle */}
        <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
          <button type="button" onClick={() => setSide(PositionSide.Long)} disabled={disabled}
            className={cn('flex-1 py-3 md:py-2 text-base md:text-sm font-bold transition-all', isLong ? 'bg-[#2563EB] text-white' : 'bg-white/[0.03] text-white/40 hover:bg-[#2563EB]/15', disabled && 'opacity-40 cursor-not-allowed')}>
            BUY
          </button>
          <button type="button" onClick={() => setSide(PositionSide.Short)} disabled={disabled}
            className={cn('flex-1 py-3 md:py-2 text-base md:text-sm font-bold transition-all', !isLong ? 'bg-[#DC2626] text-white' : 'bg-white/[0.03] text-white/40 hover:bg-[#DC2626]/15', disabled && 'opacity-40 cursor-not-allowed')}>
            SELL
          </button>
        </div>

        {/* Order type toggle: Market / Limit */}
        <div className="flex rounded-md overflow-hidden border border-white/[0.06]">
          {(['MARKET', 'LIMIT'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setOrderType(t)} disabled={disabled}
              className={cn('flex-1 py-2.5 md:py-1.5 text-xs md:text-[10px] font-semibold transition-all',
                orderType === t ? 'bg-white/[0.08] text-white' : 'text-white/30 hover:text-white/50',
                disabled && 'opacity-40 cursor-not-allowed')}>
              {t}
            </button>
          ))}
        </div>

        {/* Limit price input */}
        {orderType === 'LIMIT' && (
          <div className="relative">
            <input type="number" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} disabled={disabled}
              placeholder={entryPrice > 0 ? formatPrice(entryPrice, priceDecimals) : 'Limit price'}
              className={cn('w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white font-mono placeholder:text-white/15 focus:outline-none focus:border-[#7C3AED]/40', disabled && 'opacity-40 cursor-not-allowed')} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/25">Limit</span>
          </div>
        )}

        {/* Leverage badge */}
        <div className="flex items-center justify-center gap-2 bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-lg px-3 py-1">
          <span className="text-[10px] font-bold text-[#7C3AED]">{leverage}x</span>
          <span className="text-white/15 text-[9px]">&middot;</span>
          <span className="text-[9px] text-white/40">Cross Margin</span>
        </div>

        {/* Position size */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">Size</label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-white font-mono">{formatUsd(sizeUsd)}</span>
              {refPrice > 0 && sizeMode === 'USD' && (
                <span className="text-[9px] text-white/30 font-mono">
                  ≈ {isForex
                    ? `${(sizeUsd / FOREX_LOT_SIZE).toFixed(2)} lot`
                    : `${assetQty.toFixed(assetQty < 1 ? 4 : 2)} ${selectedMarket}`}
                </span>
              )}
              {refPrice > 0 && sizeMode === 'ASSET' && (
                <span className="text-[9px] text-white/30 font-mono">
                  ≈ {assetQty.toFixed(assetQty < 1 ? 4 : 2)} {selectedMarket}
                </span>
              )}
              {refPrice > 0 && sizeMode === 'LOT' && (
                <span className="text-[9px] text-white/30 font-mono">
                  ≈ {(sizeUsd / FOREX_LOT_SIZE).toFixed(2)} lot
                </span>
              )}
            </div>
          </div>

          <input type="range" min={10} max={maxSize} step={Math.max(10, Math.round(Number(maxSize) / 200 / 10) * 10)} value={Number(sizeUsd)}
            onChange={(e) => setSizeUsd(Number(e.target.value))} disabled={disabled}
            style={{
              background: `linear-gradient(to right, #7C3AED ${((Number(sizeUsd) - 10) / (Number(maxSize) - 10)) * 100}%, #2A2A3E ${((Number(sizeUsd) - 10) / (Number(maxSize) - 10)) * 100}%)`,
              height: '6px',
              borderRadius: '3px',
              WebkitAppearance: 'none',
              appearance: 'none',
            }}
            className={cn(
              'w-full cursor-pointer outline-none',
              '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:h-[18px]',
              '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#7C3AED]',
              '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer',
              '[&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#7C3AED] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:cursor-pointer',
              '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-[3px] [&::-moz-range-track]:bg-[#2A2A3E]',
              '[&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-[3px] [&::-moz-range-progress]:bg-[#7C3AED]',
              disabled && 'opacity-40 cursor-not-allowed')} />

          {/* Quick % buttons */}
          <div className="grid grid-cols-4 gap-1">
            {[25, 50, 75, 100].map((pct) => {
              const val = Math.max(10, Math.round((Number(maxSize) * pct) / 100 / 10) * 10);
              return (
                <button key={pct} type="button" disabled={disabled} onClick={() => setSizeUsd(val)}
                  className={cn('py-1 rounded text-[9px] font-semibold transition-all',
                    Number(sizeUsd) === val ? 'bg-[#7C3AED]/20 text-[#7C3AED] border border-[#7C3AED]/30' : 'bg-white/[0.03] text-white/30 border border-white/[0.06] hover:text-white/50',
                    disabled && 'opacity-40 cursor-not-allowed')}>
                  {pct}%
                </button>
              );
            })}
          </div>

          {/* Manual input */}
          <div className="relative">
            <input
              type="number"
              value={sizeMode === 'USD' ? sizeUsd : Number(displayValue.toFixed(sizeMode === 'LOT' ? 2 : (displayValue < 1 ? 4 : 2)))}
              onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) handleSizeInputChange(v); }}
              onBlur={() => { if (sizeUsd < 10) setSizeUsd(10); }}
              min={0}
              step={inputStep}
              disabled={disabled}
              placeholder={sizeMode === 'USD' ? '10' : sizeMode === 'LOT' ? '0.01' : '0.001'}
              className={cn('w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white font-mono placeholder:text-white/15 focus:outline-none focus:border-[#7C3AED]/40', disabled && 'opacity-40 cursor-not-allowed')}
            />
            <button
              type="button"
              onClick={cycleSizeMode}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/40 hover:text-[#7C3AED] transition-colors bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-0.5 font-semibold"
            >
              {displayLabel}
            </button>
          </div>
        </div>

        {/* SL/TP toggle */}
        <button type="button" onClick={() => setShowSlTp(!showSlTp)} disabled={disabled}
          className={cn('flex items-center justify-between w-full py-1.5 px-2 rounded-md text-[10px] font-semibold transition-all',
            showSlTp ? 'bg-white/[0.06] text-white/60' : 'bg-white/[0.02] text-white/30 hover:text-white/50',
            disabled && 'opacity-40 cursor-not-allowed')}>
          <span>Stop Loss / Take Profit</span>
          {showSlTp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {/* SL/TP inputs */}
        {showSlTp && (
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} disabled={disabled}
                placeholder={isLong ? `Below ${formatPrice(Number(entryPrice), priceDecimals)}` : `Above ${formatPrice(Number(entryPrice), priceDecimals)}`}
                className={cn('w-full bg-white/[0.03] border border-[#EF4444]/20 rounded-lg px-3 py-1.5 text-sm text-white font-mono placeholder:text-white/15 focus:outline-none focus:border-[#EF4444]/40', disabled && 'opacity-40 cursor-not-allowed')} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#EF4444]/50">SL</span>
            </div>
            {slPnl !== null && (
              <div className="text-[9px] text-[#EF4444] px-1">SL P&L: {formatUsd(Number(slPnl))} ({((Number(slPnl) / Number(sizeUsd)) * 100).toFixed(1)}%)</div>
            )}

            <div className="relative">
              <input type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} disabled={disabled}
                placeholder={isLong ? `Above ${formatPrice(Number(entryPrice), priceDecimals)}` : `Below ${formatPrice(Number(entryPrice), priceDecimals)}`}
                className={cn('w-full bg-white/[0.03] border border-[#22C55E]/20 rounded-lg px-3 py-1.5 text-sm text-white font-mono placeholder:text-white/15 focus:outline-none focus:border-[#22C55E]/40', disabled && 'opacity-40 cursor-not-allowed')} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#22C55E]/50">TP</span>
            </div>
            {tpPnl !== null && (
              <div className="text-[9px] text-[#22C55E] px-1">TP P&L: +{formatUsd(Number(tpPnl))} (+{((Number(tpPnl) / Number(sizeUsd)) * 100).toFixed(1)}%)</div>
            )}
          </div>
        )}

        {/* Computed values */}
        {Number(sizeUsd) > 0 && Number(refPrice) > 0 && (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-2 flex flex-col gap-1">
            {[
              { label: 'Margin', value: formatUsd(Number(margin)), color: 'text-white' },
              { label: `Fee (${(POSITION_FEE_RATE * 100).toFixed(3)}%)`, value: formatUsd(Number(fee)), color: 'text-white/50' },
              { label: orderType === 'LIMIT' ? 'Limit price' : 'Entry price', value: formatPrice(Number(refPrice), priceDecimals), color: 'text-white' },
              { label: 'Est. liq.', value: formatPrice(Number(liqPrice), priceDecimals), color: 'text-[#EF4444]' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between text-[10px]">
                <span className="text-white/30">{row.label}</span>
                <span className={cn('font-mono', row.color)}>{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-lg px-3 py-1.5 text-[10px] text-[#EF4444]">
            {error}
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={disabled || isLoading || Number(sizeUsd) < 10}
          className={cn('w-full py-3.5 md:py-2.5 text-base md:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2',
            isLong ? 'bg-[#2563EB] hover:bg-[#3B82F6] text-white' : 'bg-[#DC2626] hover:bg-[#EF4444] text-white',
            (disabled || isLoading || sizeUsd < 10) && 'opacity-40 cursor-not-allowed')}>
          {isLoading && <Loader2 size={14} className="animate-spin" />}
          {isAuthenticated
            ? orderType === 'LIMIT'
              ? `Place ${isLong ? 'Buy' : 'Sell'} Limit`
              : `Open ${isLong ? 'Long' : 'Short'}`
            : walletConnected ? 'Sign in to trade' : 'Connect wallet'}
        </button>
      </form>
    </div>
  );
});
