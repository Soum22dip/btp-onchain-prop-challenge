'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { PageShell } from '@/components/layout/PageShell';
import { getAdminTraders, banTrader } from '@/lib/api';
import type { AdminTrader } from '@/lib/types';
import { ExternalLink, Loader2, Search, ChevronRight, Filter } from 'lucide-react';
import { cn, formatDateTime, timeAgo, formatUsd } from '@/lib/utils';
import Link from 'next/link';

type BanState = 'idle' | 'confirming' | 'loading';
type StatusFilter = 'ALL' | 'ACTIVE' | 'BANNED' | 'SUSPENDED';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-success/10 text-success',
    BANNED: 'bg-danger/10 text-danger',
    SUSPENDED: 'bg-warning/10 text-warning',
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

function BanButton({ trader }: { trader: AdminTrader }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<BanState>('idle');

  const handleBan = async () => {
    setState('loading');
    try {
      await banTrader(trader.id, 'Banned by admin');
      await queryClient.invalidateQueries({ queryKey: ['traders'] });
    } catch (err: unknown) {
      console.error('Failed to ban trader:', err);
      // TODO: Show error toast to user
      setState('idle');
      return;
    }
    setState('idle');
  };

  if (trader.status === 'BANNED') {
    return <span className="text-[11px] text-text-muted">&mdash;</span>;
  }

  if (state === 'idle') {
    return (
      <button
        onClick={() => setState('confirming')}
        className="text-[11px] px-2 py-1 border border-danger/40 text-danger rounded hover:bg-danger/10 transition-colors"
      >
        Ban
      </button>
    );
  }

  if (state === 'confirming') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-text-secondary">Ban?</span>
        <button
          onClick={handleBan}
          className="text-[11px] px-2 py-0.5 bg-danger text-white rounded hover:bg-danger/80 transition-colors"
        >
          Yes
        </button>
        <button
          onClick={() => setState('idle')}
          className="text-[11px] px-2 py-0.5 bg-surface-2 text-text-secondary rounded hover:text-white transition-colors"
        >
          No
        </button>
      </div>
    );
  }

  return <Loader2 size={14} className="animate-spin text-text-secondary" />;
}

export default function TradersPage() {
  const { checked, isAuthenticated } = useAdminAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['traders'],
    queryFn: getAdminTraders,
    staleTime: 30000,
    enabled: isAuthenticated,
  });

  if (!checked) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-text-secondary" size={24} />
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const traders = data?.items ?? [];
  const filtered = traders.filter((t) => {
    const matchesSearch = !search || t.walletAddress.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = traders.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PageShell
      title="Traders"
      subtitle="All registered trader accounts"
      actions={
        data && (
          <span className="text-text-secondary text-sm number-font">
            {data.total.toLocaleString()} traders
          </span>
        )
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search by wallet address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface border border-border-setl8 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-text-muted" />
          {(['ALL', 'ACTIVE', 'BANNED', 'SUSPENDED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'text-[11px] px-2.5 py-1.5 rounded-lg font-medium transition-colors',
                statusFilter === s
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-2',
              )}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              {s !== 'ALL' && statusCounts[s] ? ` (${statusCounts[s]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">
              <p>{search ? 'No traders matching that address' : 'No traders yet'}</p>
            </div>
          ) : (
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-setl8 bg-surface-2/50">
                      <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">
                        Wallet
                      </th>
                      <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">
                        Status
                      </th>
                      <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">
                        Account Size
                      </th>
                      <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">
                        Current P&L
                      </th>
                      <th className="text-center px-4 py-3 text-text-secondary font-medium text-xs">
                        Attempt
                      </th>
                      <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">
                        Payouts
                      </th>
                      <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">
                        Joined
                      </th>
                      <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((trader) => (
                    <tr
                      key={trader.id}
                      className="border-b border-border-setl8 last:border-0 hover:bg-white/[0.015] transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-white">
                            {trader.walletAddress.slice(0, 6)}...
                            {trader.walletAddress.slice(-4)}
                          </span>
                          <a
                            href={`https://solscan.io/account/${trader.walletAddress}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-muted hover:text-text-secondary"
                          >
                            <ExternalLink size={11} />
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={trader.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-white number-font text-xs">
                        {trader.accountSize != null
                          ? formatUsd(Number(trader.accountSize))
                          : <span className="text-text-muted">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3 text-right number-font text-xs">
                        {trader.currentPnl != null ? (
                          <span className={trader.currentPnl >= 0 ? 'text-success' : 'text-danger'}>
                            {trader.currentPnl >= 0 ? '+' : ''}{formatUsd(trader.currentPnl)}
                          </span>
                        ) : (
                          <span className="text-text-muted">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-text-secondary number-font text-xs">
                        {trader.currentAttemptNumber ?? trader.totalAttempts}/{6}
                      </td>
                      <td className="px-4 py-3 text-right text-white number-font text-xs">
                        {formatUsd(Number(trader.totalPayoutsUsd))}
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {timeAgo(trader.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <BanButton trader={trader} />
                          <Link
                            href={`/traders/${trader.id}`}
                            className="text-text-muted hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <ChevronRight size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
