'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Medal,
  ExternalLink,
  TrendingUp,
  Users,
  DollarSign,
  BarChart3,
  Flame,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { cn, formatUsd, formatNumber, truncateAddress, getSolscanAccountUrl, getSolscanTxUrl } from '@/lib/utils';
import {
  getEnhancedLeaderboard,
  getRecentPayouts,
  getLeaderboardStats,
  type EnhancedLeaderboardEntry,
  type RecentPayout,
  type LeaderboardStats,
} from '@/lib/api';

// ---------------------------------------------------------------------------
// Animated counter
// ---------------------------------------------------------------------------

function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  duration = 1500,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [displayed, setDisplayed] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = null;

    const animate = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * value));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  const formatted = displayed >= 1_000_000
    ? `${(displayed / 1_000_000).toFixed(1)}M`
    : displayed >= 1_000
    ? `${(displayed / 1_000).toFixed(displayed >= 10_000 ? 0 : 1)}K`
    : formatNumber(displayed);

  return (
    <span className="number-font font-bold text-2xl text-white">
      {prefix}{formatted}{suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function StatsBar({ stats }: { stats: LeaderboardStats | null }) {
  if (!stats) {
    return null;
  }

  const items = [
    { label: 'Total Traders', value: Number(stats.totalTraders) || 0, icon: Users, prefix: '', suffix: '' },
    { label: 'Total Payouts', value: Number(stats.totalPayoutsUsd) || 0, icon: DollarSign, prefix: '$', suffix: '' },
    { label: 'Total Volume', value: Number(stats.totalVolumeUsd) || 0, icon: BarChart3, prefix: '$', suffix: '' },
    { label: 'Vault Fires', value: Number(stats.totalVaultFires) || 0, icon: Flame, prefix: '', suffix: '' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
    >
      {items.map(({ label, value, icon: Icon, prefix, suffix }) => (
        <div
          key={label}
          className="bg-[#111111] border border-white/[0.06] rounded-xl p-4 text-center"
        >
          <div className="flex items-center justify-center gap-1.5 text-text-secondary text-xs mb-2">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </div>
          <AnimatedCounter value={value} prefix={prefix} suffix={suffix} />
        </div>
      ))}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Time filter tabs
// ---------------------------------------------------------------------------

type TimePeriod = 'all' | 'month' | 'week';

function TimeFilterTabs({
  active,
  onChange,
}: {
  active: TimePeriod;
  onChange: (period: TimePeriod) => void;
}) {
  const tabs: { id: TimePeriod; label: string }[] = [
    { id: 'all', label: 'All Time' },
    { id: 'month', label: 'This Month' },
    { id: 'week', label: 'This Week' },
  ];

  return (
    <div className="inline-flex bg-[#111111] border border-white/[0.06] rounded-lg p-1">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
            active === id
              ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20'
              : 'text-white/40 hover:text-white/60',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly champions
// ---------------------------------------------------------------------------

function MonthlyChampions({ entries }: { entries: EnhancedLeaderboardEntry[] }) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;

  const podiumConfig = [
    {
      bgGrad: 'from-yellow-500/20 to-yellow-600/5',
      border: 'border-yellow-500/40',
      icon: <Trophy className="w-6 h-6 text-yellow-400" />,
      badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
      label: '1st Place',
      glow: 'shadow-yellow-500/10',
    },
    {
      bgGrad: 'from-slate-400/15 to-slate-500/5',
      border: 'border-slate-400/30',
      icon: <Medal className="w-5 h-5 text-slate-300" />,
      badge: 'bg-slate-400/20 text-slate-300 border-slate-400/30',
      label: '2nd Place',
      glow: 'shadow-slate-400/10',
    },
    {
      bgGrad: 'from-amber-700/15 to-amber-800/5',
      border: 'border-amber-700/30',
      icon: <Medal className="w-5 h-5 text-amber-600" />,
      badge: 'bg-amber-700/20 text-amber-600 border-amber-700/30',
      label: '3rd Place',
      glow: 'shadow-amber-700/10',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="mb-8"
    >
      <h2 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-400" />
        Monthly Champions
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {top3.map((entry, i) => {
          const config = podiumConfig[i];
          return (
            <motion.div
              key={entry.traderId}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className={cn(
                'relative bg-gradient-to-b rounded-xl border p-5 shadow-lg',
                config.bgGrad,
                config.border,
                config.glow,
              )}
            >
              {/* Badge */}
              <div className="flex items-center justify-between mb-4">
                <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', config.badge)}>
                  {config.label}
                </span>
                {config.icon}
              </div>

              {/* Wallet */}
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-white font-medium text-sm">
                  {truncateAddress(entry.walletAddress, 6)}
                </span>
                <a
                  href={getSolscanAccountUrl(entry.walletAddress, 'devnet')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-secondary hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">P&L</div>
                  <div className="text-success text-sm font-bold number-font">
                    {formatUsd(Number(entry.totalPnlUsd) || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Win Rate</div>
                  <div className="text-white text-sm font-bold number-font">
                    {((Number(entry.winRate) || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Trades</div>
                  <div className="text-white text-sm font-bold number-font">{Number(entry.totalTrades) || 0}</div>
                </div>
                <div>
                  <div className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Payouts</div>
                  <div className="text-success text-sm font-bold number-font">
                    {formatUsd(Number(entry.totalPayoutsUsd) || 0)}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Sortable table
// ---------------------------------------------------------------------------

type SortKey = 'rank' | 'totalPnlUsd' | 'winRate' | 'totalTrades' | 'bestTradeUsd' | 'passedAttempts' | 'totalPayoutsUsd';
type SortDir = 'asc' | 'desc';

function SortIcon({ column, sortKey, sortDir }: { column: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (column !== sortKey) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />;
}

function StatusPill({ status }: { status: 'active' | 'funded' | 'completed' }) {
  const map = {
    active: 'bg-success/10 text-success border-success/30',
    funded: 'bg-[#7C3AED]/10 text-[#7C3AED] border-[#7C3AED]/30',
    completed: 'bg-white/5 text-white/50 border-white/10',
  };
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize', map[status])}>
      {status}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-7 h-7 rounded-full bg-yellow-500/20 border border-yellow-500/50 flex items-center justify-center">
        <Trophy className="w-3.5 h-3.5 text-yellow-400" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-7 h-7 rounded-full bg-slate-400/20 border border-slate-400/50 flex items-center justify-center">
        <Medal className="w-3.5 h-3.5 text-slate-300" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-7 h-7 rounded-full bg-amber-700/20 border border-amber-700/50 flex items-center justify-center">
        <Medal className="w-3.5 h-3.5 text-amber-600" />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-white/[0.04] flex items-center justify-center">
      <span className="text-white/40 text-xs font-semibold">{rank}</span>
    </div>
  );
}

function LeaderboardTable({
  entries,
  sortKey,
  sortDir,
  onSort,
}: {
  entries: EnhancedLeaderboardEntry[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const columns: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'rank', label: 'Rank', align: 'left' },
    { key: 'totalPnlUsd', label: 'Total P&L', align: 'right' },
    { key: 'winRate', label: 'Win Rate', align: 'right' },
    { key: 'totalTrades', label: 'Trades', align: 'right' },
    { key: 'bestTradeUsd', label: 'Best Trade', align: 'right' },
    { key: 'passedAttempts', label: 'Phases', align: 'right' },
    { key: 'totalPayoutsUsd', label: 'Payouts', align: 'right' },
  ];

  return (
    <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {columns.map(({ key, label, align }) => (
                <th
                  key={key}
                  className={cn(
                    'text-text-secondary text-[10px] font-medium uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-white/60 transition-colors select-none',
                    align === 'right' ? 'text-right' : 'text-left',
                    key === 'rank' && 'w-16',
                  )}
                  onClick={() => onSort(key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    <SortIcon column={key} sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </th>
              ))}
              {/* Trader column (not sortable) */}
              <th className="text-left text-text-secondary text-[10px] font-medium uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const isTop3 = entry.rank <= 3;
              return (
                <motion.tr
                  key={entry.traderId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02, duration: 0.3 }}
                  className={cn(
                    'border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors',
                    isTop3 && 'bg-white/[0.02]',
                  )}
                >
                  {/* Rank */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <RankBadge rank={entry.rank} />
                      <div className="hidden sm:block">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-white/70 text-xs">
                            {truncateAddress(entry.walletAddress)}
                          </span>
                          <a
                            href={getSolscanAccountUrl(entry.walletAddress, 'devnet')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-secondary hover:text-primary transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Total P&L */}
                  <td className="px-4 py-3.5 text-right">
                    <span className={cn('font-bold number-font text-sm', (Number(entry.totalPnlUsd) || 0) >= 0 ? 'text-success' : 'text-danger')}>
                      {(Number(entry.totalPnlUsd) || 0) >= 0 ? '+' : ''}{formatUsd(Number(entry.totalPnlUsd) || 0)}
                    </span>
                  </td>

                  {/* Win Rate */}
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-white number-font text-sm font-medium">
                      {((Number(entry.winRate) || 0) * 100).toFixed(1)}%
                    </span>
                  </td>

                  {/* Trades */}
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-white/60 number-font text-sm">{Number(entry.totalTrades) || 0}</span>
                  </td>

                  {/* Best Trade */}
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-success number-font text-sm font-medium">
                      {formatUsd(Number(entry.bestTradeUsd) || 0)}
                    </span>
                  </td>

                  {/* Phases */}
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-white font-semibold text-sm">{entry.passedAttempts}</span>
                      <span className="text-white/30 text-xs">/ 7</span>
                    </div>
                  </td>

                  {/* Payouts */}
                  <td className="px-4 py-3.5 text-right">
                    <span className={cn('number-font text-sm font-semibold', (Number(entry.totalPayoutsUsd) || 0) > 0 ? 'text-success' : 'text-white/30')}>
                      {(Number(entry.totalPayoutsUsd) || 0) > 0 ? formatUsd(Number(entry.totalPayoutsUsd) || 0) : '—'}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <StatusPill status={(entry.status as 'active' | 'funded' | 'completed') || 'completed'} />
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent payouts feed
// ---------------------------------------------------------------------------

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RecentPayoutsFeed({ payouts }: { payouts: RecentPayout[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <h3 className="text-white font-bold text-sm flex items-center gap-2">
          <Flame className="w-4 h-4 text-[#F59E0B]" />
          Recent Payouts
        </h3>
        <div className="flex items-center gap-1.5 text-white/30 text-xs">
          <Clock className="w-3 h-3" />
          Auto-refreshes
        </div>
      </div>

      <div className="divide-y divide-white/[0.03] max-h-[420px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {payouts.map((payout, i) => (
            <motion.div
              key={payout.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-success/10 border border-success/20 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-white/70 text-xs">
                      {truncateAddress(payout.walletAddress)}
                    </span>
                    <a
                      href={getSolscanTxUrl(payout.txSignature, 'devnet')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-secondary hover:text-primary transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="text-white/30 text-[10px] mt-0.5">
                    {formatTimeAgo(payout.processedAt)}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-success font-bold number-font text-sm">
                  +{formatUsd(payout.amountUsd)}
                </div>
                <div className="text-white/30 text-[10px]">{payout.tokenSymbol}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#111111] border border-white/[0.06] rounded-xl p-4 animate-pulse">
            <div className="h-3 bg-white/[0.06] rounded w-20 mx-auto mb-3" />
            <div className="h-7 bg-white/[0.06] rounded w-24 mx-auto" />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-white/[0.03] animate-pulse">
            <div className="w-7 h-7 rounded-full bg-white/[0.06]" />
            <div className="flex-1 h-4 bg-white/[0.06] rounded" />
            <div className="w-16 h-4 bg-white/[0.06] rounded" />
            <div className="w-20 h-4 bg-white/[0.06] rounded" />
            <div className="w-16 h-4 bg-white/[0.06] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard page
// ---------------------------------------------------------------------------

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<EnhancedLeaderboardEntry[]>([]);
  const [payouts, setPayouts] = useState<RecentPayout[]>([]);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>('all');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const fetchData = useCallback(async (p: TimePeriod) => {
    setLoading(true);
    try {
      const [leaderboardRes, payoutsRes, statsRes] = await Promise.allSettled([
        getEnhancedLeaderboard(p),
        getRecentPayouts(20),
        getLeaderboardStats(),
      ]);

      if (leaderboardRes.status === 'fulfilled') {
        setEntries(Array.isArray(leaderboardRes.value) ? leaderboardRes.value : []);
      }
      if (payoutsRes.status === 'fulfilled') {
        setPayouts(Array.isArray(payoutsRes.value) ? payoutsRes.value : []);
      }
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value);
      }
    } catch {
      // Errors handled by allSettled, fallback to empty states
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  // Auto-refresh payouts every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const fresh = await getRecentPayouts(20);
        setPayouts(fresh);
      } catch {
        // ignore
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Sort handler
  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir(key === 'rank' ? 'asc' : 'desc');
      }
    },
    [sortKey],
  );

  // Sort entries with null-safe comparison
  const sorted = [...entries].sort((a, b) => {
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    const diff = (Number(aVal) || 0) - (Number(bVal) || 0);
    return sortDir === 'asc' ? diff : -diff;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10"
      >
        <div className="inline-flex items-center gap-2 bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] text-sm px-4 py-1.5 rounded-full mb-4">
          <Trophy className="w-4 h-4" />
          Top Traders
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">Leaderboard</h1>
        <p className="text-white/40 text-lg max-w-lg mx-auto">
          The best performing traders on Setl8, ranked by profit performance.
        </p>
      </motion.div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* Stats bar */}
          {stats && <StatsBar stats={stats} />}

          {/* Monthly champions */}
          {period === 'month' && <MonthlyChampions entries={entries} />}
          {period === 'all' && <MonthlyChampions entries={entries} />}

          {/* Filter + table */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
              <TimeFilterTabs active={period} onChange={setPeriod} />
              <div className="text-white/30 text-xs">
                {sorted.length} traders
              </div>
            </div>

            <LeaderboardTable
              entries={sorted}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>

          {/* Recent payouts feed */}
          {payouts.length > 0 && <RecentPayoutsFeed payouts={payouts} />}
        </>
      )}
    </div>
  );
}
