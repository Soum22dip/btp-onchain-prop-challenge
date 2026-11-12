'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { PageShell } from '@/components/layout/PageShell';
import { getTraderDetail } from '@/lib/api';
import { cn, formatUsd, formatPercent, formatDateTime, timeAgo } from '@/lib/utils';
import { ArrowLeft, ExternalLink, Loader2, Copy } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-success/10 text-success',
    BANNED: 'bg-danger/10 text-danger',
    SUSPENDED: 'bg-warning/10 text-warning',
    PASSED: 'bg-success/10 text-success',
    FAILED: 'bg-danger/10 text-danger',
    IN_PROGRESS: 'bg-info/10 text-info',
  };
  return (
    <span
      className={cn(
        'text-[11px] font-medium px-2 py-0.5 rounded',
        map[status] ?? 'bg-surface-2 text-text-secondary',
      )}
    >
      {status}
    </span>
  );
}

export default function TraderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const traderId = params.id as string;
  const { checked, isAuthenticated } = useAdminAuth();
  const [copied, setCopied] = useState(false);

  const { data: trader, isLoading } = useQuery({
    queryKey: ['trader-detail', traderId],
    queryFn: () => getTraderDetail(traderId),
    enabled: isAuthenticated && !!traderId,
    staleTime: 30000,
  });

  if (!checked) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-text-secondary" size={24} />
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <PageShell
      title="Trader Detail"
      subtitle={trader ? `Wallet: ${trader.walletAddress.slice(0, 8)}...${trader.walletAddress.slice(-6)}` : 'Loading...'}
      actions={
        <button
          onClick={() => router.push('/traders')}
          className="flex items-center gap-2 text-text-secondary hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Traders
        </button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="animate-spin text-text-secondary" size={24} />
        </div>
      ) : !trader ? (
        <div className="text-center py-12">
          <p className="text-text-secondary">Trader not found</p>
          <Link href="/traders" className="text-primary text-sm mt-2 inline-block">
            Back to traders
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Info Card */}
          <div className="glass-card rounded-xl p-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-text-muted text-xs mb-1">Wallet Address</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-white">
                    {trader.walletAddress.slice(0, 8)}...{trader.walletAddress.slice(-6)}
                  </span>
                  <button
                    onClick={() => handleCopy(trader.walletAddress)}
                    className="text-text-muted hover:text-white transition-colors"
                  >
                    {copied ? (
                      <span className="text-success text-[10px]">Copied</span>
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                  <a
                    href={`https://solscan.io/account/${trader.walletAddress}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-muted hover:text-primary transition-colors"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Status</p>
                <StatusBadge status={trader.status} />
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Total Attempts</p>
                <p className="text-white font-semibold number-font">{trader.totalAttempts} / 6</p>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Total Payouts</p>
                <p className="text-white font-semibold number-font">{formatUsd(Number(trader.totalPayoutsUsd))}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-4 pt-4 border-t border-border-setl8">
              <div>
                <p className="text-text-muted text-xs mb-1">Joined</p>
                <p className="text-text-secondary text-sm">{formatDateTime(trader.createdAt)}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Last Updated</p>
                <p className="text-text-secondary text-sm">{timeAgo(trader.updatedAt)}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Fraud Flags</p>
                <p className={cn('text-sm font-medium', trader.fraudFlags.length > 0 ? 'text-danger' : 'text-text-secondary')}>
                  {trader.fraudFlags.length > 0 ? trader.fraudFlags.join(', ').replace(/_/g, ' ') : 'None'}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Active Attempt</p>
                <p className="text-text-secondary text-sm">{trader.activeAttemptId ? 'Yes' : 'None'}</p>
              </div>
            </div>
          </div>

          {/* Attempts History */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border-setl8">
              <h2 className="text-sm font-semibold text-white">Attempt History</h2>
            </div>
            {!Array.isArray(trader.attempts) || trader.attempts.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-text-secondary text-sm">No attempt history available</p>
                {/* TODO: needs backend endpoint GET /api/admin/traders/:id */}
                <p className="text-text-muted text-xs mt-1">Backend endpoint needed</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-setl8 bg-surface-2/50">
                    <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Attempt</th>
                    <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">Account Size</th>
                    <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">P&L</th>
                    <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">P&L %</th>
                    <th className="text-center px-4 py-3 text-text-secondary font-medium text-xs">Status</th>
                    <th className="text-center px-4 py-3 text-text-secondary font-medium text-xs">Positions</th>
                    <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(trader.attempts) ? trader.attempts : []).map((attempt) => (
                    <tr key={attempt.id} className="border-b border-border-setl8 last:border-0 hover:bg-white/[0.015]">
                      <td className="px-4 py-3 text-white font-medium">#{attempt.attemptNumber}</td>
                      <td className="px-4 py-3 text-right text-white number-font">{formatUsd(attempt.accountSize)}</td>
                      <td className="px-4 py-3 text-right number-font">
                        <span className={attempt.pnlUsd >= 0 ? 'text-success' : 'text-danger'}>
                          {attempt.pnlUsd >= 0 ? '+' : ''}{formatUsd(attempt.pnlUsd)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right number-font">
                        <span className={attempt.pnlPercent >= 0 ? 'text-success' : 'text-danger'}>
                          {formatPercent(attempt.pnlPercent, 2, true)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={attempt.status} />
                      </td>
                      <td className="px-4 py-3 text-center text-text-secondary number-font">{attempt.positionsCount}</td>
                      <td className="px-4 py-3 text-text-secondary text-xs">{formatDateTime(attempt.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Payout History */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border-setl8">
              <h2 className="text-sm font-semibold text-white">Payout History</h2>
            </div>
            {!Array.isArray(trader.payoutHistory) || trader.payoutHistory.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-text-secondary text-sm">No payout history available</p>
                <p className="text-text-muted text-xs mt-1">Backend endpoint needed</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-setl8 bg-surface-2/50">
                    <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">Amount</th>
                    <th className="text-center px-4 py-3 text-text-secondary font-medium text-xs">Token</th>
                    <th className="text-center px-4 py-3 text-text-secondary font-medium text-xs">Status</th>
                    <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Requested</th>
                    <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Tx Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(trader.payoutHistory) ? trader.payoutHistory : []).map((payout) => (
                    <tr key={payout.id} className="border-b border-border-setl8 last:border-0 hover:bg-white/[0.015]">
                      <td className="px-4 py-3 text-right text-white number-font">{formatUsd(Number(payout.amountUsd))}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-surface-2 text-text-secondary">{payout.tokenSymbol}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={payout.status} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">{formatDateTime(payout.requestedAt)}</td>
                      <td className="px-4 py-3 text-text-muted text-xs font-mono">
                        {payout.txHash ? `${payout.txHash.slice(0, 8)}...` : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
