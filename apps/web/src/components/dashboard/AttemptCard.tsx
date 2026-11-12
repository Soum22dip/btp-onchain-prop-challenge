'use client';

import React from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn, formatUsd, formatPercent } from '@/lib/utils';
import type { Attempt } from '@setl8/types';
import { AttemptStatus, AttemptPhase } from '@setl8/types';
import { PROFIT_TARGET_PERCENT, MAX_DRAWDOWN_PERCENT } from '@setl8/constants';

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  value: number; // 0-1
  max?: number;
  color?: string;
  className?: string;
}

function ProgressBar({ value, max = 1, color = 'bg-primary', className }: ProgressBarProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  return (
    <div className={cn('h-2 bg-surface-2 rounded-full overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attempt status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AttemptStatus }) {
  const map: Record<AttemptStatus, { label: string; class: string }> = {
    [AttemptStatus.Active]: { label: 'Active', class: 'bg-success/10 text-success border-success/30' },
    [AttemptStatus.Passed]: { label: 'Passed', class: 'bg-primary/10 text-primary border-primary/30' },
    [AttemptStatus.Failed]: { label: 'Failed', class: 'bg-danger/10 text-danger border-danger/30' },
    [AttemptStatus.Abandoned]: { label: 'Abandoned', class: 'bg-surface text-text-secondary border-border-setl8' },
  };
  const { label, class: cls } = map[status];
  return (
    <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', cls)}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// AttemptCard
// ---------------------------------------------------------------------------

interface AttemptCardProps {
  attempt: Attempt;
  isActive?: boolean;
}

export default function AttemptCard({ attempt, isActive = false }: AttemptCardProps) {
  const currentBalance = Number(attempt.currentBalance) || 0;
  const startingBalance = Number(attempt.startingBalance) || 0;
  const peakBalance = Number(attempt.peakBalance) || 0;
  const pnlUsd = currentBalance - startingBalance;
  const pnlPercent = startingBalance > 0 ? pnlUsd / startingBalance : 0;
  const isPnlPositive = pnlPercent >= 0;

  // Profit target progress (how far toward +8%)
  const profitProgress = Math.max(pnlPercent, 0) / PROFIT_TARGET_PERCENT;

  // Drawdown from peak
  const drawdownFromPeak = peakBalance > 0 ? (peakBalance - currentBalance) / peakBalance : 0;
  const drawdownProgress = drawdownFromPeak / MAX_DRAWDOWN_PERCENT;
  const isDrawdownWarning = drawdownFromPeak > MAX_DRAWDOWN_PERCENT * 0.6;

  const isFunded = attempt.phase === AttemptPhase.Funded;

  return (
    <div
      className={cn(
        'card p-5 space-y-4 transition-all duration-200',
        isActive && 'border-primary/40 shadow-purple-glow-sm',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-text-secondary text-sm font-medium">
              Attempt #{attempt.attemptNumber}
            </span>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded border',
                isFunded
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-surface text-text-secondary border-border-setl8',
              )}
            >
              {isFunded ? 'Funded' : 'Evaluation'}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono number-font">
            {formatUsd(currentBalance)}
          </div>
        </div>
        <StatusBadge status={attempt.status} />
      </div>

      {/* P&L */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex items-center gap-1.5 text-lg font-bold number-font',
            isPnlPositive ? 'text-success' : 'text-danger',
          )}
        >
          {isPnlPositive ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
          {formatPercent(pnlPercent)}
        </div>
        <span className="text-text-secondary text-sm">
          {isPnlPositive ? '+' : ''}{formatUsd(pnlUsd)}
        </span>
      </div>

      {/* Profit target progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Profit Target
          </span>
          <span className="text-white font-medium">
            {formatPercent(pnlPercent)} / {formatPercent(PROFIT_TARGET_PERCENT, 0, false)}
          </span>
        </div>
        <ProgressBar
          value={Math.max(profitProgress, 0)}
          color={profitProgress >= 1 ? 'bg-success' : 'bg-primary'}
        />
      </div>

      {/* Drawdown progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className={cn('flex items-center gap-1', isDrawdownWarning ? 'text-warning' : 'text-text-secondary')}>
            {isDrawdownWarning ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            Max Drawdown
          </span>
          <span className={cn('font-medium', isDrawdownWarning ? 'text-warning' : 'text-white')}>
            {formatPercent(drawdownFromPeak, 2, false)} / {formatPercent(MAX_DRAWDOWN_PERCENT, 0, false)}
          </span>
        </div>
        <ProgressBar
          value={drawdownProgress}
          color={
            drawdownProgress > 0.85
              ? 'bg-danger'
              : drawdownProgress > 0.6
              ? 'bg-warning'
              : 'bg-success'
          }
        />
      </div>

      {/* Account info */}
      <div className="grid grid-cols-3 gap-3 pt-1 border-t border-border-setl8">
        <div>
          <div className="text-text-secondary text-xs mb-0.5">Account Size</div>
          <div className="text-white text-sm font-semibold number-font">{formatUsd(Number(attempt.accountSize) || 0, 0)}</div>
        </div>
        <div>
          <div className="text-text-secondary text-xs mb-0.5">Token</div>
          <div className="text-white text-sm font-semibold">{attempt.tokenUsed ?? '—'}</div>
        </div>
        <div>
          <div className="text-text-secondary text-xs mb-0.5">Payouts</div>
          <div className={cn('text-sm font-semibold', isFunded ? 'text-success' : 'text-text-secondary')}>
            {isFunded ? formatUsd(Number(attempt.totalPayoutTaken) || 0) : 'N/A'}
          </div>
        </div>
      </div>
    </div>
  );
}
