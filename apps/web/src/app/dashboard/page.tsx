'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Plus,
  RefreshCw,
  Info,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  MessageCircle,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { cn, formatUsd, formatPercent, formatDate, formatDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  getAttemptChains,
  getPayouts,
  getNextPayoutBatch,
  getPnl,
  getPhaseHistory,
  getTelegramLinkCode,
  type ChainsResponse,
  type AttemptChain,
  type ChainPhase,
  type PhaseTradeEntry,
  type PnlData,
} from '@/lib/api';
import type {
  PayoutRequest as PayoutRequestType,
  NextPayoutInfo,
} from '@setl8/types';
import { PayoutStatus } from '@setl8/types';

// ---------------------------------------------------------------------------
// Phase dot for timeline
// ---------------------------------------------------------------------------

function PhaseDot({ status }: { status: string }) {
  if (status === 'PASSED') {
    return (
      <div className="w-6 h-6 rounded-full bg-success/20 border-2 border-success flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
      </div>
    );
  }
  if (status === 'ACTIVE') {
    return (
      <div className="w-6 h-6 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center shrink-0">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
      </div>
    );
  }
  if (status === 'FAILED') {
    return (
      <div className="w-6 h-6 rounded-full bg-danger/20 border-2 border-danger flex items-center justify-center shrink-0">
        <XCircle className="w-3.5 h-3.5 text-danger" />
      </div>
    );
  }
  // upcoming / abandoned
  return (
    <div className="w-6 h-6 rounded-full bg-surface border-2 border-border-setl8 shrink-0" />
  );
}

// ---------------------------------------------------------------------------
// Phase timeline (horizontal)
// ---------------------------------------------------------------------------

function PhaseTimeline({ phases }: { phases: ChainPhase[] }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {phases.map((phase, i) => (
        <React.Fragment key={phase.id}>
          <div className="flex items-center gap-1.5 shrink-0">
            <PhaseDot status={phase.status} />
            <span className={cn(
              'text-xs font-medium whitespace-nowrap',
              phase.status === 'ACTIVE' ? 'text-primary' :
              phase.status === 'PASSED' ? 'text-success' :
              phase.status === 'FAILED' ? 'text-danger' : 'text-text-secondary',
            )}>
              {phase.phaseLabel}
            </span>
          </div>
          {i < phases.length - 1 && (
            <div className={cn(
              'h-px w-6 shrink-0',
              phases[i + 1].status === 'PASSED' || phases[i + 1].status === 'ACTIVE'
                ? 'bg-success/40'
                : 'bg-border-setl8',
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade table for expanded phase
// ---------------------------------------------------------------------------

function PhaseTradeTable({ trades }: { trades: PhaseTradeEntry[] }) {
  const closeReasonLabel: Record<string, string> = {
    MANUAL: 'Manual',
    STOP_LOSS: 'Stop Loss',
    TAKE_PROFIT: 'Take Profit',
    DRAWDOWN: 'Drawdown',
    LIQUIDATION: 'Liquidation',
  };

  if (trades.length === 0) {
    return (
      <div className="py-4 text-center text-text-secondary text-xs">No closed trades in this phase</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="text-left text-text-secondary text-[10px] font-medium uppercase tracking-wider px-3 py-2">Market</th>
            <th className="text-left text-text-secondary text-[10px] font-medium uppercase tracking-wider px-3 py-2">Side</th>
            <th className="text-right text-text-secondary text-[10px] font-medium uppercase tracking-wider px-3 py-2">Size</th>
            <th className="text-right text-text-secondary text-[10px] font-medium uppercase tracking-wider px-3 py-2">Entry</th>
            <th className="text-right text-text-secondary text-[10px] font-medium uppercase tracking-wider px-3 py-2">Exit</th>
            <th className="text-right text-text-secondary text-[10px] font-medium uppercase tracking-wider px-3 py-2">Gross</th>
            <th className="text-right text-text-secondary text-[10px] font-medium uppercase tracking-wider px-3 py-2">Fees</th>
            <th className="text-right text-text-secondary text-[10px] font-medium uppercase tracking-wider px-3 py-2">Net</th>
            <th className="text-left text-text-secondary text-[10px] font-medium uppercase tracking-wider px-3 py-2">Close</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const isLong = trade.side === 'LONG' || trade.side === 'Long';
            const totalFees = Number(trade.openFee ?? 0) + Number(trade.closeFee ?? 0);
            const grossPnl = Number(trade.realizedPnl ?? 0) + Number(trade.closeFee ?? 0);
            const netPnl = Number(trade.realizedPnl ?? 0) - Number(trade.openFee ?? 0);

            return (
              <tr key={trade.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-white text-xs font-medium">{trade.market}/USD</td>
                <td className="px-3 py-2">
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', isLong ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-white number-font text-xs">{formatUsd(Number(trade.size), 0)}</td>
                <td className="px-3 py-2 text-right text-white number-font text-xs">${Number(trade.entryPrice).toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-white number-font text-xs">
                  {trade.exitPrice !== null ? `$${Number(trade.exitPrice).toFixed(2)}` : '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={cn('number-font text-xs', grossPnl >= 0 ? 'text-success/60' : 'text-danger/60')}>
                    {grossPnl >= 0 ? '+' : ''}{formatUsd(grossPnl)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-text-secondary number-font text-xs">-{formatUsd(totalFees)}</td>
                <td className="px-3 py-2 text-right">
                  <span className={cn('font-semibold number-font text-xs', netPnl >= 0 ? 'text-success' : 'text-danger')}>
                    {netPnl >= 0 ? '+' : ''}{formatUsd(netPnl)}
                  </span>
                </td>
                <td className="px-3 py-2 text-text-secondary text-xs">
                  {closeReasonLabel[trade.closeReason ?? ''] ?? trade.closeReason ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable phase row
// ---------------------------------------------------------------------------

function PhaseRow({
  phase,
  isExpanded,
  onToggle,
}: {
  phase: ChainPhase;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [trades, setTrades] = useState<PhaseTradeEntry[] | null>(null);
  const [loadingTrades, setLoadingTrades] = useState(false);

  useEffect(() => {
    if (isExpanded && trades === null) {
      setLoadingTrades(true);
      getPhaseHistory(phase.id)
        .then((res) => setTrades(res.trades))
        .catch(() => setTrades([]))
        .finally(() => setLoadingTrades(false));
    }
  }, [isExpanded, phase.id, trades]);

  const pnlPct = phase.pnlPercent;
  const isPnlPositive = pnlPct >= 0;

  return (
    <div className="border-b border-white/[0.04] last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        <PhaseDot status={phase.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{phase.phaseLabel}</span>
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded',
              phase.status === 'ACTIVE' ? 'bg-primary/10 text-primary' :
              phase.status === 'PASSED' ? 'bg-success/10 text-success' :
              phase.status === 'FAILED' ? 'bg-danger/10 text-danger' :
              'bg-surface text-text-secondary',
            )}>
              {phase.status}
            </span>
          </div>
          <div className="text-[11px] text-text-secondary mt-0.5">
            {formatUsd(phase.startingBalance, 0)} &rarr; {formatUsd(phase.currentBalance, 0)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={cn('text-sm font-bold number-font', isPnlPositive ? 'text-success' : 'text-danger')}>
            {isPnlPositive ? '+' : ''}{pnlPct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-text-secondary">{phase.tradeCount} trades</div>
        </div>
        <div className="shrink-0 text-text-secondary">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-white/[0.02] border-t border-white/[0.04] px-2">
              {loadingTrades ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
                </div>
              ) : (
                <PhaseTradeTable trades={trades ?? []} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chain card (for current + past)
// ---------------------------------------------------------------------------

function ChainCard({
  chain,
  isCurrent,
  isExpanded,
  onToggleExpand,
  expandedPhaseId,
  onTogglePhase,
  pnl,
  tradeUrl,
}: {
  chain: AttemptChain;
  isCurrent: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  expandedPhaseId: string | null;
  onTogglePhase: (id: string) => void;
  pnl: PnlData | null;
  tradeUrl: string;
}) {
  const activePhase = chain.phases.find((p) => p.status === 'ACTIVE');
  const lastPhase = chain.phases[chain.phases.length - 1];

  return (
    <div className={cn(
      'card overflow-hidden transition-all',
      isCurrent && 'border-primary/30 shadow-purple-glow-sm',
    )}>
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between px-5 py-4',
          !isCurrent && 'cursor-pointer hover:bg-white/[0.02]',
        )}
        onClick={!isCurrent ? onToggleExpand : undefined}
      >
        <div className="flex items-center gap-3">
          {isCurrent ? (
            <div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse shrink-0" />
          ) : (
            <div className={cn(
              'w-2.5 h-2.5 rounded-full shrink-0',
              chain.failedAtPhase ? 'bg-danger' : 'bg-success',
            )} />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold">
                {isCurrent ? 'Active Attempt' : `Attempt #${chain.chainNumber}`}
              </h3>
              {!isCurrent && chain.failedAtPhase && (
                <span className="text-[10px] text-danger bg-danger/10 px-1.5 py-0.5 rounded">
                  Failed at {chain.failedAtPhase}
                </span>
              )}
            </div>
            <div className="text-text-secondary text-xs mt-0.5">
              {chain.phases.length} phase{chain.phases.length !== 1 ? 's' : ''} &middot; Started {formatDate(chain.startedAt)}
              {chain.totalPayouts > 0 && (
                <> &middot; <span className="text-success">{formatUsd(chain.totalPayouts)} paid out</span></>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isCurrent && (
            <a
              href={tradeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary flex items-center gap-2 text-sm"
            >
              Open Terminal
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {!isCurrent && (
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-sm font-bold number-font',
                chain.totalPnl >= 0 ? 'text-success' : 'text-danger',
              )}>
                {chain.totalPnl >= 0 ? '+' : ''}{formatUsd(chain.totalPnl)}
              </span>
              {isExpanded ? <ChevronDown className="w-4 h-4 text-text-secondary" /> : <ChevronRight className="w-4 h-4 text-text-secondary" />}
            </div>
          )}
        </div>
      </div>

      {/* Content (always visible for current, toggleable for past) */}
      {(isCurrent || isExpanded) && (
        <div className="border-t border-white/[0.06]">
          {/* Phase timeline */}
          <div className="px-5 py-3 border-b border-white/[0.04]">
            <PhaseTimeline phases={chain.phases} />
          </div>

          {/* Live stats for active phase */}
          {isCurrent && activePhase && pnl && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 py-4 border-b border-white/[0.04]">
              <div>
                <div className="text-text-secondary text-[10px] uppercase tracking-wider mb-1">Balance</div>
                <div className="text-white text-lg font-bold number-font">{formatUsd(pnl.currentBalance)}</div>
              </div>
              <div>
                <div className="text-text-secondary text-[10px] uppercase tracking-wider mb-1">P&L</div>
                <div className={cn('text-lg font-bold number-font', pnl.pnlPercent >= 0 ? 'text-success' : 'text-danger')}>
                  {pnl.pnlPercent >= 0 ? '+' : ''}{formatPercent(pnl.pnlPercent / 100)}
                </div>
              </div>
              <div>
                <div className="text-text-secondary text-[10px] uppercase tracking-wider mb-1">Target</div>
                <div className="text-white text-lg font-bold number-font">{formatUsd(activePhase.startingBalance * 1.08, 0)}</div>
              </div>
              <div>
                <div className="text-text-secondary text-[10px] uppercase tracking-wider mb-1">Drawdown</div>
                <div className={cn('text-lg font-bold number-font',
                  pnl.drawdownPercent > 6 ? 'text-danger' : pnl.drawdownPercent > 4 ? 'text-warning' : 'text-success',
                )}>
                  {pnl.drawdownPercent.toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {/* Expandable phase rows */}
          <div>
            <div className="px-5 py-2 border-b border-white/[0.04]">
              <span className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold">
                Phases &middot; Click to see trades
              </span>
            </div>
            {chain.phases.map((phase) => (
              <PhaseRow
                key={phase.id}
                phase={phase}
                isExpanded={expandedPhaseId === phase.id}
                onToggle={() => onTogglePhase(phase.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payout section (simplified)
// ---------------------------------------------------------------------------

function PayoutSection({ payouts, nextBatch }: { payouts: PayoutRequestType[]; nextBatch: NextPayoutInfo | null }) {
  const safePayouts = Array.isArray(payouts) ? payouts : [];
  const completedPayouts = safePayouts.filter((p) => p.status === PayoutStatus.Completed);
  const totalPaidOut = completedPayouts.reduce((sum, p) => sum + Number(p.amountUsd), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Payouts</h2>
        {totalPaidOut > 0 && (
          <span className="text-sm text-success font-bold number-font">
            {formatUsd(totalPaidOut)} earned
          </span>
        )}
      </div>

      {nextBatch && (
        <div className="card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-text-secondary text-xs mb-0.5">Next Payout Batch</div>
              <div className="text-white font-bold">{formatDate(nextBatch.nextBatchAt)}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-text-secondary text-xs mb-0.5">Pending</div>
            <div className="text-white font-semibold number-font">{formatUsd(Number(nextBatch.pendingAmountUsd))}</div>
          </div>
        </div>
      )}

      {safePayouts.length === 0 ? (
        <div className="card p-6 text-center">
          <div className="text-text-secondary text-sm">No payout history yet</div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-setl8">
                  <th className="text-left text-text-secondary text-xs font-medium uppercase tracking-wider px-5 py-3">Date</th>
                  <th className="text-left text-text-secondary text-xs font-medium uppercase tracking-wider px-5 py-3">Token</th>
                  <th className="text-right text-text-secondary text-xs font-medium uppercase tracking-wider px-5 py-3">Amount</th>
                  <th className="text-left text-text-secondary text-xs font-medium uppercase tracking-wider px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {safePayouts.map((payout) => {
                  const statusMap: Record<PayoutStatus, { label: string; cls: string }> = {
                    [PayoutStatus.Pending]: { label: 'Pending', cls: 'text-warning' },
                    [PayoutStatus.Approved]: { label: 'Approved', cls: 'text-primary' },
                    [PayoutStatus.Processing]: { label: 'Processing', cls: 'text-primary' },
                    [PayoutStatus.Completed]: { label: 'Completed', cls: 'text-success' },
                    [PayoutStatus.Rejected]: { label: 'Rejected', cls: 'text-danger' },
                  };
                  const { label, cls } = statusMap[payout.status];
                  return (
                    <tr key={payout.id} className="border-b border-border-setl8 hover:bg-surface-2 transition-colors">
                      <td className="px-5 py-3 text-text-secondary text-sm">{formatDate(payout.requestedAt)}</td>
                      <td className="px-5 py-3 text-white font-medium">{payout.tokenSymbol}</td>
                      <td className="px-5 py-3 text-right text-white number-font font-semibold">{formatUsd(Number(payout.amountUsd))}</td>
                      <td className={cn('px-5 py-3 text-sm font-medium', cls)}>{label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Telegram Link Modal
// ---------------------------------------------------------------------------

function TelegramLinkModal({
  code,
  loading,
  error,
  onClose,
}: {
  code: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-sm rounded-2xl border border-border-setl8 bg-[#111111] p-6 shadow-2xl"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-secondary hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
          <MessageCircle className="w-7 h-7 text-primary" />
        </div>

        <h3 className="text-xl font-bold text-white text-center mb-2">Link Telegram</h3>
        <p className="text-text-secondary text-sm text-center mb-6">
          Send this code to{' '}
          <a
            href="https://t.me/setl8bot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            @setl8bot
          </a>
          {' '}on Telegram
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-4 text-sm text-center">
            {error}
          </div>
        ) : code ? (
          <>
            {/* Code display */}
            <button
              onClick={handleCopy}
              className="w-full group relative bg-surface border border-border-setl8 hover:border-primary/40 rounded-xl p-5 mb-4 transition-all"
            >
              <div className="text-primary text-4xl font-bold tracking-[0.3em] font-mono text-center">
                {code}
              </div>
              <div className="absolute top-3 right-3 text-text-secondary group-hover:text-primary transition-colors">
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </div>
            </button>

            {/* Expiry note */}
            <div className="flex items-center justify-center gap-1.5 text-text-secondary text-xs">
              <Clock className="w-3.5 h-3.5" />
              Code expires in 5 minutes
            </div>
          </>
        ) : null}

        {/* Open Telegram link */}
        {!loading && !error && (
          <a
            href="https://t.me/setl8bot"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Open @setl8bot
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, trader } = useAuth();

  const [chainsData, setChainsData] = useState<ChainsResponse | null>(null);
  const [payouts, setPayouts] = useState<PayoutRequestType[]>([]);
  const [nextBatch, setNextBatch] = useState<NextPayoutInfo | null>(null);
  const [pnl, setPnl] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPastChain, setExpandedPastChain] = useState<number | null>(null);
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null);
  const [tgModalOpen, setTgModalOpen] = useState(false);
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);

  const handleLinkTelegram = useCallback(async () => {
    setTgModalOpen(true);
    setTgCode(null);
    setTgError(null);
    setTgLoading(true);
    try {
      const result = await getTelegramLinkCode();
      setTgCode(result.code);
    } catch (e) {
      setTgError(e instanceof Error ? e.message : 'Failed to generate link code');
    } finally {
      setTgLoading(false);
    }
  }, []);

  const tradeUrl = typeof window !== 'undefined' && window.location.hostname === 'setl8.com'
    ? 'https://trade.setl8.com'
    : 'http://localhost:3002';

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [chains, pay, batch] = await Promise.allSettled([
        getAttemptChains(),
        getPayouts(),
        getNextPayoutBatch(),
      ]);

      if (chains.status === 'rejected') {
        setError('Failed to load dashboard data. Please try again.');
      }

      if (chains.status === 'fulfilled') setChainsData(chains.value);
      if (pay.status === 'fulfilled') setPayouts(Array.isArray(pay.value) ? pay.value as PayoutRequestType[] : []);
      if (batch.status === 'fulfilled') setNextBatch(batch.value);

      // Fetch live P&L if active chain
      try {
        const pnlData = await getPnl();
        setPnl(pnlData);
      } catch {
        // No active attempt
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }
    void fetchAll();
  }, [isAuthenticated, router, fetchAll]);

  // Poll P&L every 10s if active chain
  useEffect(() => {
    if (!chainsData?.current) return;
    const interval = setInterval(async () => {
      try {
        const pnlData = await getPnl();
        setPnl(pnlData);
      } catch {
        // ignore
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [chainsData]);

  if (!isAuthenticated) return null;

  const handleTogglePhase = (phaseId: string) => {
    setExpandedPhaseId((prev) => (prev === phaseId ? null : phaseId));
  };

  const handleTogglePastChain = (chainNumber: number) => {
    setExpandedPastChain((prev) => (prev === chainNumber ? null : chainNumber));
    setExpandedPhaseId(null);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          {trader && trader.walletAddress ? (
            <p className="text-text-secondary mt-1">
              Welcome back, <span className="text-white font-medium">{trader.walletAddress.slice(0, 6)}...{trader.walletAddress.slice(-4)}</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleLinkTelegram()}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Link Telegram</span>
          </button>
          <button
            onClick={() => void fetchAll()}
            disabled={loading}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <button onClick={() => router.push('/challenge')} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            Buy Challenge
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-4 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="space-y-4 mb-8">
          <div className="card p-6 animate-pulse h-48 bg-surface" />
          <div className="card p-6 animate-pulse h-32 bg-surface" />
        </div>
      ) : chainsData?.current ? (
        /* Active attempt chain */
        <div className="mb-8">
          <ChainCard
            chain={chainsData.current}
            isCurrent
            isExpanded
            onToggleExpand={() => {}}
            expandedPhaseId={expandedPhaseId}
            onTogglePhase={handleTogglePhase}
            pnl={pnl}
            tradeUrl={tradeUrl}
          />
        </div>
      ) : (
        /* No active attempt */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-12 text-center mb-8"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">No Active Challenge</h2>
          <p className="text-text-secondary mb-6">
            {trader?.totalAttempts && trader.totalAttempts >= 6
              ? 'You have used all 6 attempts. Your trading journey is complete.'
              : 'Start your first challenge and prove your trading edge.'}
          </p>
          {(!trader?.totalAttempts || trader.totalAttempts < 6) && (
            <button onClick={() => router.push('/challenge')} className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Buy a Challenge
            </button>
          )}
        </motion.div>
      )}

      {/* Past attempts */}
      {!loading && chainsData && chainsData.past.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Past Attempts</h2>
          <div className="space-y-3">
            {chainsData.past.map((chain) => (
              <ChainCard
                key={chain.chainNumber}
                chain={chain}
                isCurrent={false}
                isExpanded={expandedPastChain === chain.chainNumber}
                onToggleExpand={() => handleTogglePastChain(chain.chainNumber)}
                expandedPhaseId={expandedPhaseId}
                onTogglePhase={handleTogglePhase}
                pnl={null}
                tradeUrl={tradeUrl}
              />
            ))}
          </div>
        </section>
      )}

      {/* Payouts */}
      {!loading && (
        <section>
          <PayoutSection payouts={payouts} nextBatch={nextBatch} />
        </section>
      )}

      {/* Telegram Link Modal */}
      <AnimatePresence>
        {tgModalOpen && (
          <TelegramLinkModal
            code={tgCode}
            loading={tgLoading}
            error={tgError}
            onClose={() => setTgModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
