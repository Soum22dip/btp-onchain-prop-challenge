'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { PageShell } from '@/components/layout/PageShell';
import { getPayoutQueue, processPayouts, getOverviewStats } from '@/lib/api';
import { cn, formatUsd, formatDateTime } from '@/lib/utils';
import { Loader2, CheckCircle, XCircle, Timer, TrendingUp, DollarSign, ArrowDownRight } from 'lucide-react';

type PayoutStatusKey = 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
type TokenKey = 'USDC' | 'USDT' | 'USD1';
type TabKey = 'pending' | 'all';

const STATUS_BADGE: Record<PayoutStatusKey, string> = {
  PENDING: 'bg-warning/10 text-warning',
  APPROVED: 'bg-blue-500/10 text-blue-400',
  PROCESSING: 'bg-primary/10 text-primary',
  COMPLETED: 'bg-success/10 text-success',
  REJECTED: 'bg-danger/10 text-danger',
};

const TOKEN_BADGE: Record<TokenKey, string> = {
  USDC: 'bg-blue-500/10 text-blue-400',
  USDT: 'bg-success/10 text-success',
  USD1: 'bg-primary/10 text-primary',
};

function PayoutStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'text-[11px] font-medium px-2 py-0.5 rounded',
        STATUS_BADGE[status as PayoutStatusKey] ?? 'bg-surface-2 text-text-secondary',
      )}
    >
      {status}
    </span>
  );
}

function TokenBadge({ token }: { token: string }) {
  return (
    <span
      className={cn(
        'text-[11px] font-medium px-2 py-0.5 rounded',
        TOKEN_BADGE[token as TokenKey] ?? 'bg-surface-2 text-text-secondary',
      )}
    >
      {token}
    </span>
  );
}

export default function PayoutsPage() {
  const { checked, isAuthenticated } = useAdminAuth();
  const [confirmingProcess, setConfirmingProcess] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultError, setResultError] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('pending');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['payouts'],
    queryFn: getPayoutQueue,
    staleTime: 15000,
    enabled: isAuthenticated,
  });

  const { data: overviewStats } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: getOverviewStats,
    staleTime: 60000,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!resultMessage) return;
    const timer = setTimeout(() => setResultMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [resultMessage]);

  if (!checked) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-text-secondary" size={24} />
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const allItems = Array.isArray(data?.items) ? data.items : [];
  const pendingItems = allItems.filter((i) => i.status === 'PENDING');
  const completedItems = allItems.filter((i) => i.status === 'COMPLETED');
  const pendingCount = pendingItems.length;
  const totalPendingUsd = data?.totalPendingUsd ?? 0;
  const nextVaultFireAt = overviewStats?.nextVaultFireAt ? new Date(overviewStats.nextVaultFireAt).getTime() : Date.now();

  const displayItems = activeTab === 'pending' ? pendingItems : allItems;

  const handleConfirmProcess = async () => {
    setConfirmingProcess(false);
    setProcessing(true);
    try {
      const result = await processPayouts();
      setResultMessage(result.message ?? 'Payouts processed successfully');
      setResultError(false);
      await refetch();
    } catch (err: unknown) {
      setResultMessage(
        err instanceof Error ? err.message : 'Failed to process payouts',
      );
      setResultError(true);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <PageShell
      title="Payout Management"
      subtitle="Upcoming payouts, history, and batch processing"
      actions={
        <button
          onClick={() => setConfirmingProcess(true)}
          disabled={pendingCount === 0 || processing}
          className="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {processing && <Loader2 size={14} className="animate-spin" />}
          Process {pendingCount} Payouts
        </button>
      }
    >
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Timer size={14} className="text-warning" />
              <span className="text-text-secondary text-xs">Pending</span>
            </div>
            <p className="text-xl font-bold text-white number-font">{pendingCount}</p>
            <p className="text-text-muted text-xs number-font">{formatUsd(totalPendingUsd)}</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={14} className="text-success" />
              <span className="text-text-secondary text-xs">Completed</span>
            </div>
            <p className="text-xl font-bold text-white number-font">{completedItems.length}</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownRight size={14} className="text-danger" />
              <span className="text-text-secondary text-xs">Total Paid</span>
            </div>
            <p className="text-xl font-bold text-white number-font">
              {formatUsd(overviewStats?.totalPayoutsUsd ?? 0)}
            </p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-primary" />
              <span className="text-text-secondary text-xs">Total Revenue</span>
            </div>
            <p className="text-xl font-bold text-white number-font">
              {formatUsd(overviewStats?.totalVolumeUsd ?? 0)}
            </p>
            <p className="text-text-muted text-[10px]">
              Paid/Rev ratio:{' '}
              {overviewStats && overviewStats.totalVolumeUsd > 0
                ? ((overviewStats.totalPayoutsUsd / overviewStats.totalVolumeUsd) * 100).toFixed(1)
                : '0'}
              %
            </p>
          </div>
        </div>

        {/* Next Vault Fire */}
        {overviewStats?.nextVaultFireAt && (
          <div className="glass-card rounded-xl px-5 py-3 flex items-center gap-4">
            <DollarSign size={16} className="text-warning" />
            <span className="text-text-secondary text-sm">Next vault fire:</span>
            <span className="text-white text-sm font-medium">
              {formatDateTime(overviewStats.nextVaultFireAt)}
            </span>
          </div>
        )}

        {/* Confirmation banner */}
        {confirmingProcess && (
          <div className="flex items-center gap-4 px-4 py-3 bg-warning/10 border border-warning/30 rounded-lg">
            <p className="text-sm text-warning flex-1">
              Process {pendingCount} payout{pendingCount !== 1 ? 's' : ''} totaling{' '}
              {formatUsd(totalPendingUsd)}?
            </p>
            <button
              onClick={handleConfirmProcess}
              className="text-sm px-3 py-1.5 bg-warning text-black font-medium rounded hover:bg-warning/90 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmingProcess(false)}
              className="text-sm px-3 py-1.5 bg-surface-2 text-text-secondary rounded hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Result banner */}
        {resultMessage && (
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3 border rounded-lg',
              resultError
                ? 'bg-danger/10 border-danger/30 text-danger'
                : 'bg-success/10 border-success/30 text-success',
            )}
          >
            {resultError ? <XCircle size={16} /> : <CheckCircle size={16} />}
            <p className="text-sm">{resultMessage}</p>
          </div>
        )}

        {/* Tab filters */}
        <div className="flex gap-1 border-b border-border-setl8">
          {([
            { key: 'pending' as const, label: 'Pending', count: pendingCount },
            { key: 'all' as const, label: 'All Payouts', count: allItems.length },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tab.key
                  ? 'border-primary text-white'
                  : 'border-transparent text-text-secondary hover:text-white',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'ml-2 text-[11px] px-1.5 py-0.5 rounded',
                  activeTab === tab.key
                    ? 'bg-primary/20 text-primary'
                    : 'bg-surface-2 text-text-muted',
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-setl8 bg-surface-2/50">
                  <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Wallet</th>
                  <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">Amount</th>
                  <th className="text-center px-4 py-3 text-text-secondary font-medium text-xs">Token</th>
                  <th className="text-center px-4 py-3 text-text-secondary font-medium text-xs">Attempt</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Requested</th>
                  <th className="text-center px-4 py-3 text-text-secondary font-medium text-xs">Status</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border-setl8">
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-surface-2 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : displayItems.length === 0
                  ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-text-secondary text-sm">
                          {activeTab === 'pending' ? 'No pending payouts' : 'No payouts in queue'}
                        </td>
                      </tr>
                    )
                  : (Array.isArray(displayItems) ? displayItems : []).map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-border-setl8 last:border-0 hover:bg-white/[0.015] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-white">
                            {item.trader.walletAddress.slice(0, 6)}...
                            {item.trader.walletAddress.slice(-4)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-white font-medium number-font">
                          {formatUsd(Number(item.amountUsd))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <TokenBadge token={item.tokenSymbol} />
                        </td>
                        <td className="px-4 py-3 text-center text-text-secondary text-xs number-font">
                          #{item.attempt.attemptNumber}
                        </td>
                        <td className="px-4 py-3 text-text-secondary text-xs">
                          {formatDateTime(item.requestedAt)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <PayoutStatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-text-muted text-xs font-mono">
                          {item.txHash ? (
                            <a
                              href={`https://solscan.io/tx/${item.txHash}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-primary transition-colors"
                            >
                              {item.txHash.slice(0, 8)}...
                            </a>
                          ) : (
                            '\u2014'
                          )}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
