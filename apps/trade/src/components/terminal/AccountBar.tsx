'use client';

import { usePnlStore } from '@/store/pnl';
import { formatUsd, formatPercent, cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// AccountBar — bottom bar with challenge progress
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col shrink-0">
      <span className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">
        {label}
      </span>
      <span className={cn('text-[11px] font-semibold font-mono', color ?? 'text-white')}>
        {value}
      </span>
    </div>
  );
}

export function AccountBar() {
  const {
    hasActiveAttempt,
    realizedPnl,
    unrealizedPnl,
    currentBalance,
    startingBalance,
    pnlPercent,
    drawdownPercent,
    targetPrice,
    drawdownPrice,
    phase,
    attemptNumber,
  } = usePnlStore();

  const realizedPnlNum = Number(realizedPnl);
  const unrealizedPnlNum = Number(unrealizedPnl);
  const currentBalanceNum = Number(currentBalance);
  const startingBalanceNum = Number(startingBalance);
  const pnlPercentNum = Number(pnlPercent);
  const drawdownPercentNum = Number(drawdownPercent);
  const targetPriceNum = Number(targetPrice);
  const drawdownPriceNum = Number(drawdownPrice);

  if (!hasActiveAttempt) {
    return (
      <div className="h-10 shrink-0 border-t border-white/[0.06] bg-white/[0.02] flex items-center justify-between px-4">
        <p className="text-[11px] text-white/30">
          No active challenge —{' '}
          <a
            href="http://setl8.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#7C3AED] hover:underline"
          >
            buy one at setl8.com
          </a>
        </p>
        <span className="text-[9px] text-white/15 font-mono">
          Bybit &middot; Finnhub &middot; 82 markets
        </span>
      </div>
    );
  }

  const absDD = Math.abs(drawdownPercentNum);
  const ddColor = absDD >= 6 ? 'text-[#EF4444]' : absDD >= 4 ? 'text-[#F59E0B]' : 'text-[#22C55E]';

  // Progress toward target: 0% = starting balance, 100% = target
  const range = targetPriceNum - startingBalanceNum;
  const progressRaw = range > 0 ? ((currentBalanceNum - startingBalanceNum) / range) * 100 : 0;
  const progress = Math.max(-100, Math.min(100, isNaN(progressRaw) || !isFinite(progressRaw) ? 0 : progressRaw));

  // Drawdown progress: how close to the floor (0% = at peak, 100% = at floor)
  const ddRange = startingBalanceNum - drawdownPriceNum;
  const ddProgressRaw = ddRange > 0 ? ((startingBalanceNum - currentBalanceNum) / ddRange) * 100 : 0;
  const ddProgress = Math.max(0, Math.min(100, isNaN(ddProgressRaw) || !isFinite(ddProgressRaw) ? 0 : ddProgressRaw));

  const phaseLabel = phase === 'EVALUATION' ? 'Evaluation' : 'Funded';

  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-white/[0.02]">
      {/* Desktop: single row (unchanged) */}
      <div className="hidden md:flex h-12 items-center justify-between px-4 gap-3">
        <div className="flex items-center gap-4 overflow-x-auto">
          {/* Phase badge */}
          <div className="shrink-0 bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded px-2 py-0.5">
            <span className="text-[9px] font-bold text-[#7C3AED] uppercase">{phaseLabel}</span>
          </div>

          <Stat label="Balance" value={formatUsd(currentBalanceNum)} />
          <div className="w-px h-5 bg-white/[0.06] shrink-0" />

          {/* Progress bar toward target */}
          <div className="flex flex-col shrink-0 w-32">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[8px] text-white/25 uppercase tracking-wider font-semibold">Target</span>
              <span className="text-[9px] text-white/40 font-mono">{formatUsd(targetPriceNum)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  progress >= 0 ? 'bg-[#22C55E]' : 'bg-[#EF4444]',
                )}
                style={{ width: `${Math.abs(progress)}%` }}
              />
            </div>
          </div>

          <div className="w-px h-5 bg-white/[0.06] shrink-0" />

          {/* Drawdown bar */}
          <div className="flex flex-col shrink-0 w-28">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[8px] text-white/25 uppercase tracking-wider font-semibold">Drawdown</span>
              <span className="text-[9px] text-white/40 font-mono">{formatUsd(drawdownPriceNum)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  ddProgress >= 75 ? 'bg-[#EF4444]' : ddProgress >= 50 ? 'bg-[#F59E0B]' : 'bg-[#22C55E]',
                )}
                style={{ width: `${ddProgress}%` }}
              />
            </div>
          </div>

          <div className="w-px h-5 bg-white/[0.06] shrink-0" />
          <Stat
            label="Realized P&L"
            value={`${realizedPnlNum >= 0 ? '+' : ''}${formatUsd(realizedPnlNum)}`}
            color={realizedPnlNum >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}
          />
          <div className="w-px h-5 bg-white/[0.06] shrink-0" />
          <Stat
            label="Unrealized P&L"
            value={`${unrealizedPnlNum >= 0 ? '+' : ''}${formatUsd(unrealizedPnlNum)}`}
            color={unrealizedPnlNum >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}
          />
          <div className="w-px h-5 bg-white/[0.06] shrink-0" />
          <Stat
            label="P&L %"
            value={formatPercent(pnlPercentNum, 2, true)}
            color={pnlPercentNum >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}
          />
          <div className="w-px h-5 bg-white/[0.06] shrink-0" />
          <Stat
            label="DD %"
            value={formatPercent(drawdownPercentNum, 2, true)}
            color={ddColor}
          />
        </div>
        <span className="text-[9px] text-white/15 font-mono shrink-0 ml-4 hidden lg:block">
          Bybit &middot; Finnhub &middot; 82 markets
        </span>
      </div>

      {/* Mobile: compact 2-row */}
      <div className="flex flex-col md:hidden px-3 py-1.5 gap-1">
        {/* Row 1: Phase + Balance + P&L% */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded px-1.5 py-0.5">
              <span className="text-[8px] font-bold text-[#7C3AED] uppercase">{phaseLabel}</span>
            </div>
            <span className="text-[11px] font-semibold font-mono text-white">{formatUsd(currentBalanceNum)}</span>
          </div>
          <span className={cn('text-[11px] font-semibold font-mono', pnlPercentNum >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]')}>
            {formatPercent(pnlPercentNum, 2, true)}
          </span>
        </div>

        {/* Row 2: Target + Drawdown bars side by side */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[7px] text-white/25 uppercase tracking-wider font-semibold">Target</span>
              <span className="text-[8px] text-white/40 font-mono">{formatUsd(targetPriceNum)}</span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  progress >= 0 ? 'bg-[#22C55E]' : 'bg-[#EF4444]',
                )}
                style={{ width: `${Math.abs(progress)}%` }}
              />
            </div>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[7px] text-white/25 uppercase tracking-wider font-semibold">Drawdown</span>
              <span className="text-[8px] text-white/40 font-mono">{formatUsd(drawdownPriceNum)}</span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  ddProgress >= 75 ? 'bg-[#EF4444]' : ddProgress >= 50 ? 'bg-[#F59E0B]' : 'bg-[#22C55E]',
                )}
                style={{ width: `${ddProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
