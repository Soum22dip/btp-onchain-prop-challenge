'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { MARKET_DISPLAY_NAME } from '@setl8/constants';
import { PositionSide, PositionStatus } from '@setl8/types';
import type { Position } from '@setl8/types';
import { useMarketStore } from '@/store/market';
import { useAuth } from '@/hooks/useAuth';
import { usePnlStore } from '@/store/pnl';
import { useToastStore } from '@/store/toast';
import { getPositions, closePosition, partialClosePosition, cancelLimitOrder, closeAllPositions, cancelAllOrders, getTrades, updateSlTp } from '@/lib/api';
import type { TradeEntry } from '@/lib/api';
import { formatUsd, formatPrice, getPriceDecimals, cn } from '@/lib/utils';

function computeLiqPrice(
  side: string,
  entryPrice: number,
  notionalSize: number,
  drawdownRemaining: number,
): number | null {
  if (notionalSize <= 0 || entryPrice <= 0 || drawdownRemaining <= 0) return null;
  if (side === PositionSide.Long || side === 'LONG') {
    return entryPrice * (1 - drawdownRemaining / notionalSize);
  }
  return entryPrice * (1 + drawdownRemaining / notionalSize);
}

function computeUnrealizedPnl(position: Position, currentPrice: number): number {
  const current = Number(currentPrice);
  const entry = Number(position.entryPrice);
  const size = Number(position.size);
  if (!current || !entry) return 0;
  const priceDiff = current - entry;
  const direction = position.side === PositionSide.Long ? 1 : -1;
  return (priceDiff / entry) * size * direction;
}

// Extended type for positions with extra fields from the API
interface PositionWithExtras extends Position {
  stopLoss?: number | null;
  takeProfit?: number | null;
  orderStatus?: string;
  orderType?: string;
  limitPrice?: number | null;
  remainingSize?: number;
  closedSize?: number;
  closeReason?: string | null;
  currentPrice?: number;
}

type Tab = 'positions' | 'history';

const CLOSE_REASON_LABEL: Record<string, string> = {
  MANUAL: 'Manual',
  STOP_LOSS: 'Stop Loss',
  TAKE_PROFIT: 'Take Profit',
  DRAWDOWN: 'Drawdown',
  LIQUIDATION: 'Liquidation',
  CANCELLED: 'Cancelled',
};

function formatDuration(openedAt: string, closedAt: string | null): string {
  if (!closedAt) return 'Open';
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryList({ trades }: { trades: TradeEntry[] }) {
  const closed = trades.filter((t) => t.status === 'CLOSED' && t.orderStatus !== 'CANCELLED');

  if (closed.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-[11px] text-white/20">No closed trades</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {closed.map((trade) => {
        const isLong = trade.side === 'LONG' || trade.side === PositionSide.Long;
        const totalFees = trade.openFee + trade.closeFee;
        const grossPnl = trade.realizedPnl + trade.closeFee; // add back closeFee to get price-only P&L
        const netPnl = trade.realizedPnl - trade.openFee; // subtract openFee (not included in position.realizedPnl)
        const netPositive = netPnl >= 0;
        const decimals = getPriceDecimals(trade.entryPrice, trade.market);

        return (
          <div key={trade.id} className="px-3 py-2 border-b border-white/[0.04] hover:bg-white/[0.02]">
            {/* Row 1: Market, side, Net P&L */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-white font-medium">{MARKET_DISPLAY_NAME[trade.market as keyof typeof MARKET_DISPLAY_NAME] ?? trade.market}</span>
                <span className={cn('text-[8px] font-bold px-1 py-0.5 rounded', isLong ? 'bg-[#22C55E]/15 text-[#22C55E]' : 'bg-[#EF4444]/15 text-[#EF4444]')}>
                  {isLong ? 'LONG' : 'SHORT'}
                </span>
                <span className="text-[8px] text-white/20">
                  {CLOSE_REASON_LABEL[trade.closeReason ?? ''] ?? trade.closeReason ?? ''}
                </span>
              </div>
              <span className={cn('text-[11px] font-bold font-mono', netPositive ? 'text-[#22C55E]' : 'text-[#EF4444]')}>
                {netPositive ? '+' : ''}{formatUsd(netPnl)}
              </span>
            </div>

            {/* Row 2: Size, entry, exit, duration */}
            <div className="flex items-center justify-between text-[9px] text-white/40">
              <span className="font-mono">{formatUsd(trade.size, 0)}</span>
              <span className="font-mono">Entry {formatPrice(trade.entryPrice, decimals)}</span>
              {trade.exitPrice !== null && (
                <span className="font-mono text-white/60">Exit {formatPrice(trade.exitPrice, decimals)}</span>
              )}
              <span className="text-white/25">{formatDuration(trade.openedAt, trade.closedAt)}</span>
            </div>

            {/* Row 3: P&L breakdown */}
            <div className="flex items-center gap-3 text-[9px] mt-0.5">
              <span className={cn('font-mono', grossPnl >= 0 ? 'text-[#22C55E]/60' : 'text-[#EF4444]/60')}>
                Gross: {grossPnl >= 0 ? '+' : ''}{formatUsd(grossPnl)}
              </span>
              <span className="text-white/20">
                Fees: -{formatUsd(totalFees)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PositionsList() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { hasActiveAttempt } = usePnlStore();
  const prices = useMarketStore((s) => s.prices);
  const pnlCurrentBalance = usePnlStore((s) => s.currentBalance);
  const pnlMaxDrawdownFloor = usePnlStore((s) => s.maxDrawdownFloor);
  const drawdownRemaining = pnlCurrentBalance - pnlMaxDrawdownFloor;
  const addToast = useToastStore((s) => s.addToast);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>('positions');
  const [editingSLTP, setEditingSLTP] = useState<string | null>(null);
  const [slValue, setSlValue] = useState('');
  const [tpValue, setTpValue] = useState('');

  const { data: rawPositions = [], isLoading } = useQuery({
    queryKey: ['positions'],
    queryFn: getPositions,
    refetchInterval: 5000,
    enabled: isAuthenticated && hasActiveAttempt,
  });

  const { data: tradesData } = useQuery({
    queryKey: ['trades'],
    queryFn: getTrades,
    refetchInterval: 10_000,
    enabled: isAuthenticated && hasActiveAttempt && tab === 'history',
  });

  const positions = Array.isArray(rawPositions) ? (rawPositions as PositionWithExtras[]) : [];
  const openPositions = positions.filter((p) => p.status === PositionStatus.Open && p.orderStatus !== 'PENDING');
  const pendingOrders = positions.filter((p) => p.orderStatus === 'PENDING');

  function markBusy(id: string) { setBusyIds((s) => new Set(s).add(id)); }
  function clearBusy(id: string) { setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; }); }

  async function handleClose(id: string) {
    const pos = openPositions.find((p) => p.id === id);
    markBusy(id);
    try {
      await closePosition(id);
      if (pos) {
        const cp = Number(prices[pos.market]?.price ?? Number(pos.entryPrice));
        const pnl = computeUnrealizedPnl(pos, cp);
        addToast(`Closed: ${MARKET_DISPLAY_NAME[pos.market]} ${pnl >= 0 ? '+' : ''}${formatUsd(Number(pnl))}`, pnl >= 0 ? 'success' : 'error');
      }
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
      await queryClient.invalidateQueries({ queryKey: ['trades'] });
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to close', 'error');
    } finally { clearBusy(id); }
  }

  async function handlePartialClose(id: string, percent: number) {
    markBusy(id);
    try {
      await partialClosePosition(id, percent);
      addToast(`Closed ${percent}% of position`, 'success');
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
      await queryClient.invalidateQueries({ queryKey: ['trades'] });
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally { clearBusy(id); }
  }

  async function handleCancel(id: string) {
    markBusy(id);
    try {
      await cancelLimitOrder(id);
      addToast('Limit order cancelled', 'success');
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally { clearBusy(id); }
  }

  async function handleSaveSLTP(id: string) {
    markBusy(id);
    try {
      await updateSlTp(id, slValue ? Number(slValue) : null, tpValue ? Number(tpValue) : null);
      addToast('SL/TP updated', 'success');
      setEditingSLTP(null);
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to update SL/TP', 'error');
    } finally { clearBusy(id); }
  }

  async function handleCloseAll() {
    try {
      const result = await closeAllPositions();
      addToast(`Closed ${result.closed} position${result.closed !== 1 ? 's' : ''}`, 'success');
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
      await queryClient.invalidateQueries({ queryKey: ['trades'] });
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to close all', 'error');
    }
  }

  async function handleCancelAll() {
    try {
      const result = await cancelAllOrders();
      addToast(`Cancelled ${result.cancelled} order${result.cancelled !== 1 ? 's' : ''}`, 'success');
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to cancel all', 'error');
    }
  }

  if (!isAuthenticated || !hasActiveAttempt) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-[11px] text-white/20">
          {!isAuthenticated ? 'Sign in to trade' : 'No active challenge'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center border-b border-white/[0.06] shrink-0">
        {([
          { id: 'positions' as Tab, label: `Positions (${openPositions.length})` },
          { id: 'history' as Tab, label: 'History' },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 py-2 text-[10px] font-semibold transition-all',
              tab === t.id
                ? 'text-white border-b-2 border-[#7C3AED]'
                : 'text-white/30 hover:text-white/50',
            )}
          >
            {t.label}
          </button>
        ))}
        {tab === 'positions' && openPositions.length >= 2 && (
          <button
            onClick={() => void handleCloseAll()}
            className="text-[8px] text-[#EF4444]/50 hover:text-[#EF4444] px-2 py-1 mr-1 rounded border border-[#EF4444]/10 hover:border-[#EF4444]/30 transition-all shrink-0"
          >
            Close All
          </button>
        )}
      </div>

      {/* Tab content */}
      {tab === 'positions' ? (
        <>
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={14} className="animate-spin text-white/20" />
            </div>
          ) : openPositions.length === 0 && pendingOrders.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-[11px] text-white/20">No open positions</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Open positions */}
              {openPositions.map((position) => {
                const priceFeed = prices[position.market];
                const currentPrice = Number(priceFeed?.price ?? Number(position.entryPrice));
                const unrealizedPnl = computeUnrealizedPnl(position, currentPrice);
                const isBusy = busyIds.has(position.id);
                const decimals = getPriceDecimals(Number(currentPrice), position.market);
                const isLong = position.side === PositionSide.Long;

                return (
                  <div key={position.id} className="px-3 py-2 border-b border-white/[0.04] hover:bg-white/[0.02] group">
                    {/* Row 1: Market, side, P&L */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-white font-medium">{MARKET_DISPLAY_NAME[position.market]}</span>
                        <span className={cn('text-[8px] font-bold px-1 py-0.5 rounded', isLong ? 'bg-[#22C55E]/15 text-[#22C55E]' : 'bg-[#EF4444]/15 text-[#EF4444]')}>
                          {isLong ? 'LONG' : 'SHORT'}
                        </span>
                      </div>
                      <span className={cn('text-[11px] font-bold font-mono', unrealizedPnl >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]')}>
                        {unrealizedPnl >= 0 ? '+' : ''}{formatUsd(Number(unrealizedPnl))}
                      </span>
                    </div>

                    {/* Row 2: Size, entry, current, liq */}
                    <div className="flex items-center justify-between text-[9px] text-white/40 mb-1.5">
                      <span className="font-mono">{formatUsd(Number(position.remainingSize || position.size), 0)}</span>
                      <span className="font-mono">Entry {formatPrice(Number(position.entryPrice), decimals)}</span>
                      <span className="font-mono text-white/60">{formatPrice(Number(currentPrice), decimals)}</span>
                      {(() => {
                        const liq = computeLiqPrice(
                          position.side,
                          Number(position.entryPrice),
                          Number(position.remainingSize || position.size),
                          drawdownRemaining,
                        );
                        return liq !== null ? (
                          <span className="font-mono text-[#EF4444]/60" title="Estimated liquidation price (assumes single position)">
                            Liq {formatPrice(liq, decimals)}
                          </span>
                        ) : null;
                      })()}
                    </div>

                    {/* Row 3: SL/TP indicators */}
                    {(position.stopLoss || position.takeProfit) && (
                      <div className="flex items-center gap-3 text-[8px] mb-1.5">
                        {position.stopLoss && (
                          <span className="text-[#EF4444]/60">SL {formatPrice(Number(position.stopLoss), decimals)}</span>
                        )}
                        {position.takeProfit && (
                          <span className="text-[#22C55E]/60">TP {formatPrice(Number(position.takeProfit), decimals)}</span>
                        )}
                      </div>
                    )}

                    {/* Row 4: Action buttons (visible on hover) */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {[25, 50, 75].map((pct) => (
                        <button key={pct} onClick={() => void handlePartialClose(position.id, pct)} disabled={isBusy}
                          className="text-[8px] text-white/30 hover:text-white/60 px-1.5 py-0.5 rounded border border-white/[0.06] hover:border-white/[0.15] transition-all">
                          {pct}%
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          if (editingSLTP === position.id) { setEditingSLTP(null); return; }
                          setEditingSLTP(position.id);
                          setSlValue(position.stopLoss ? String(Number(position.stopLoss)) : '');
                          setTpValue(position.takeProfit ? String(Number(position.takeProfit)) : '');
                        }}
                        className={cn('text-[8px] px-1.5 py-0.5 rounded border transition-all',
                          editingSLTP === position.id
                            ? 'text-[#7C3AED] border-[#7C3AED]/30'
                            : 'text-white/30 hover:text-white/60 border-white/[0.06] hover:border-white/[0.15]')}>
                        SL/TP
                      </button>
                      <button onClick={() => void handleClose(position.id)} disabled={isBusy}
                        className="text-[8px] text-[#EF4444]/50 hover:text-[#EF4444] px-1.5 py-0.5 rounded border border-[#EF4444]/10 hover:border-[#EF4444]/30 transition-all ml-auto flex items-center gap-0.5">
                        {isBusy ? <Loader2 size={8} className="animate-spin" /> : <><X size={8} /> Close</>}
                      </button>
                    </div>

                    {/* SL/TP inline editor */}
                    {editingSLTP === position.id && (
                      <div className="flex gap-1.5 mt-2 items-center">
                        <input type="number" step="any" placeholder="Stop Loss" value={slValue} onChange={(e) => setSlValue(e.target.value)}
                          className="bg-white/[0.05] border border-[#EF4444]/20 rounded px-2 py-1 text-[10px] text-white font-mono w-[5.5rem] placeholder:text-white/15 focus:outline-none focus:border-[#EF4444]/40" />
                        <input type="number" step="any" placeholder="Take Profit" value={tpValue} onChange={(e) => setTpValue(e.target.value)}
                          className="bg-white/[0.05] border border-[#22C55E]/20 rounded px-2 py-1 text-[10px] text-white font-mono w-[5.5rem] placeholder:text-white/15 focus:outline-none focus:border-[#22C55E]/40" />
                        <button onClick={() => void handleSaveSLTP(position.id)} disabled={isBusy}
                          className="text-[8px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-2 py-1 rounded font-semibold disabled:opacity-40">
                          {isBusy ? <Loader2 size={8} className="animate-spin" /> : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pending limit orders */}
              {pendingOrders.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between">
                    <span className="text-[8px] text-white/20 uppercase tracking-wider font-semibold">Pending Orders</span>
                    {pendingOrders.length >= 2 && (
                      <button
                        onClick={() => void handleCancelAll()}
                        className="text-[8px] text-white/30 hover:text-[#EF4444] px-1.5 py-0.5 rounded border border-white/[0.06] hover:border-[#EF4444]/30 transition-all"
                      >
                        Cancel All
                      </button>
                    )}
                  </div>
                  {pendingOrders.map((order) => {
                    const isBusy = busyIds.has(order.id);
                    const isLong = order.side === PositionSide.Long;
                    const limitPriceNum = Number(order.limitPrice || 0);
                    const decimals = getPriceDecimals(limitPriceNum, order.market);

                    return (
                      <div key={order.id} className="px-3 py-2 border-b border-white/[0.04] flex items-center justify-between hover:bg-white/[0.02]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-white/60">{MARKET_DISPLAY_NAME[order.market]}</span>
                          <span className={cn('text-[8px] font-bold px-1 py-0.5 rounded', isLong ? 'bg-[#2563EB]/15 text-[#2563EB]' : 'bg-[#DC2626]/15 text-[#DC2626]')}>
                            {isLong ? 'BUY' : 'SELL'} LIMIT
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-white/40 font-mono">{formatUsd(Number(order.size), 0)} @ {formatPrice(limitPriceNum, decimals)}</span>
                          <button onClick={() => void handleCancel(order.id)} disabled={isBusy}
                            className="text-[8px] text-white/30 hover:text-[#EF4444] px-1.5 py-0.5 rounded border border-white/[0.06] hover:border-[#EF4444]/30 transition-all">
                            {isBusy ? <Loader2 size={8} className="animate-spin" /> : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </>
      ) : (
        /* History tab */
        tradesData ? (
          <HistoryList trades={tradesData.trades} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={14} className="animate-spin text-white/20" />
          </div>
        )
      )}
    </div>
  );
}
