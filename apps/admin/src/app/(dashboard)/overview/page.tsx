'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { PageShell } from '@/components/layout/PageShell';
import { getOverviewStats, getPayoutQueue } from '@/lib/api';
import {
  Users,
  TrendingUp,
  DollarSign,
  Clock,
  Shield,
  BarChart3,
  Loader2,
  AlertTriangle,
  ShoppingCart,
  Wallet,
  Timer,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { formatUsd, formatPercent, formatDateTime } from '@/lib/utils';
import type { OverviewStats } from '@/lib/types';
import Link from 'next/link';

function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    function update() {
      const now = Date.now();
      const targetDate_safe = targetDate ? new Date(targetDate).getTime() : Date.now();
      const diff = targetDate_safe - now;

      if (diff <= 0) {
        setTimeLeft('FIRING NOW');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <span className="text-2xl font-bold text-white number-font">{timeLeft}</span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  trend,
  subtext,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  trend?: { value: string; positive: boolean };
  subtext?: string;
}) {
  return (
    <div className="glass-card rounded-xl p-5 glass-card-hover transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-secondary text-xs font-medium">{label}</span>
        <div className={`${bg} p-2 rounded-lg`}>
          <Icon size={16} className={color} />
        </div>
      </div>
      <p className="text-2xl font-bold text-white number-font">{value}</p>
      {trend && (
        <div className="flex items-center gap-1 mt-1.5">
          {trend.positive ? (
            <ArrowUpRight size={12} className="text-success" />
          ) : (
            <ArrowDownRight size={12} className="text-danger" />
          )}
          <span
            className={`text-xs number-font ${trend.positive ? 'text-success' : 'text-danger'}`}
          >
            {trend.value}
          </span>
        </div>
      )}
      {subtext && (
        <p className="text-text-muted text-xs mt-1">{subtext}</p>
      )}
    </div>
  );
}

export default function OverviewPage() {
  const { checked, isAuthenticated } = useAdminAuth();

  const { data: stats, isLoading } = useQuery<OverviewStats>({
    queryKey: ['admin-overview'],
    queryFn: getOverviewStats,
    enabled: isAuthenticated,
    refetchInterval: 60000,
  });

  const { data: payoutQueue } = useQuery({
    queryKey: ['payouts'],
    queryFn: getPayoutQueue,
    enabled: isAuthenticated,
    staleTime: 15000,
  });

  if (!checked) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-text-secondary" size={24} />
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const recentPayouts = Array.isArray(payoutQueue?.items) ? payoutQueue.items.slice(0, 5) : [];

  return (
    <PageShell title="Command Center" subtitle="Real-time platform overview">
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="animate-spin text-text-secondary" size={24} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Row 1: Primary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Traders"
              value={(stats?.totalTraders ?? 0).toLocaleString()}
              icon={Users}
              color="text-primary"
              bg="bg-primary/10"
            />
            <StatCard
              label="Challenges Sold"
              value={(stats?.challengesSold ?? 0).toLocaleString()}
              icon={ShoppingCart}
              color="text-info"
              bg="bg-info/10"
              subtext={stats ? `${formatUsd(stats.challengeRevenue)} revenue` : undefined}
            />
            <StatCard
              label="Active Funded"
              value={(stats?.activeFundedAccounts ?? 0).toLocaleString()}
              icon={TrendingUp}
              color="text-success"
              bg="bg-success/10"
            />
            <StatCard
              label="Vault Balance"
              value={stats ? formatUsd(stats.vaultBalance ?? 0) : '$0.00'}
              icon={Shield}
              color="text-primary"
              bg="bg-primary/10"
            />
          </div>

          {/* Row 2: Vault Fire Countdown + Revenue */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Vault Fire Countdown */}
            <div className="glass-card rounded-xl p-5 col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <Timer size={16} className="text-warning" />
                <span className="text-text-secondary text-xs font-medium">Next Vault Fire</span>
              </div>
              {stats?.nextVaultFireAt ? (
                <>
                  <CountdownTimer targetDate={stats.nextVaultFireAt} />
                  <p className="text-text-muted text-xs mt-2">
                    {formatDateTime(stats.nextVaultFireAt)}
                  </p>
                </>
              ) : (
                <p className="text-2xl font-bold text-text-muted">—</p>
              )}
            </div>

            {/* Revenue Breakdown */}
            <div className="glass-card rounded-xl p-5 col-span-1 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={16} className="text-success" />
                <span className="text-text-secondary text-xs font-medium">Revenue</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-text-muted text-[11px] uppercase tracking-wider mb-1">Today</p>
                  <p className="text-lg font-bold text-white number-font">
                    {stats ? formatUsd(stats.revenueToday) : '$0'}
                  </p>
                  {/* TODO: needs backend endpoint */}
                  <p className="text-text-muted text-[10px]">from challenges</p>
                </div>
                <div>
                  <p className="text-text-muted text-[11px] uppercase tracking-wider mb-1">This Week</p>
                  <p className="text-lg font-bold text-white number-font">
                    {stats ? formatUsd(stats.revenueThisWeek) : '$0'}
                  </p>
                  <p className="text-text-muted text-[10px]">from challenges</p>
                </div>
                <div>
                  <p className="text-text-muted text-[11px] uppercase tracking-wider mb-1">This Month</p>
                  <p className="text-lg font-bold text-white number-font">
                    {stats ? formatUsd(stats.revenueThisMonth) : '$0'}
                  </p>
                  <p className="text-text-muted text-[10px]">from challenges</p>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Pass Rates + Payouts Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Pass Rate (Phase 1)"
              value={stats ? formatPercent((stats.passRatePhase1 ?? 0) * 100) : '0%'}
              icon={BarChart3}
              color="text-success"
              bg="bg-success/10"
              subtext="Attempts 1-2"
            />
            <StatCard
              label="Pass Rate (Phase 2)"
              value={stats ? formatPercent((stats.passRatePhase2 ?? 0) * 100) : '0%'}
              icon={BarChart3}
              color="text-warning"
              bg="bg-warning/10"
              subtext="Attempts 3-5"
            />
            <StatCard
              label="Funded Rate"
              value={stats ? formatPercent((stats.passRateFunded ?? 0) * 100) : '0%'}
              icon={BarChart3}
              color="text-primary"
              bg="bg-primary/10"
              subtext="Reached payout"
            />
            <StatCard
              label="Total Paid Out"
              value={stats ? formatUsd(stats.totalPayoutsUsd ?? 0) : '$0.00'}
              icon={Wallet}
              color="text-danger"
              bg="bg-danger/10"
              subtext={`${stats?.pendingPayoutCount ?? 0} pending`}
            />
          </div>

          {/* Row 4: Recent Payouts + Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Payouts */}
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white">Recent Payouts</h2>
                <Link
                  href="/payouts"
                  className="text-xs text-primary hover:text-primary-hover transition-colors"
                >
                  View all
                </Link>
              </div>
              {recentPayouts.length === 0 ? (
                <p className="text-text-secondary text-sm py-4">No pending payouts</p>
              ) : (
                <div className="space-y-2">
                  {recentPayouts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-2 border-b border-border-setl8 last:border-0"
                    >
                      <div>
                        <p className="text-xs font-mono text-white">
                          {p.trader.walletAddress.slice(0, 4)}...
                          {p.trader.walletAddress.slice(-4)}
                        </p>
                        <p className="text-[11px] text-text-muted">{p.tokenSymbol}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-white number-font">
                          {formatUsd(Number(p.amountUsd))}
                        </p>
                        <p className="text-[11px] text-text-muted">{p.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="glass-card rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Quick Actions</h2>
              <div className="space-y-1">
                {[
                  { href: '/traders', icon: Users, label: 'View all traders' },
                  {
                    href: '/payouts',
                    icon: DollarSign,
                    label: 'Manage payout queue',
                    badge: stats?.pendingPayoutCount,
                  },
                  { href: '/sales', icon: ShoppingCart, label: 'Challenge sales' },
                  { href: '/fraud', icon: AlertTriangle, label: 'Review fraud flags' },
                  { href: '/vault', icon: Shield, label: 'Vault health' },
                  { href: '/market', icon: Clock, label: 'Market monitor' },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 text-sm text-text-secondary hover:text-white transition-colors py-2.5 px-2 rounded-lg hover:bg-white/[0.02]"
                    >
                      <Icon size={14} />
                      <span className="flex-1">{item.label}</span>
                      {'badge' in item && (item.badge ?? 0) > 0 && (
                        <span className="bg-warning/20 text-warning text-[10px] px-1.5 py-0.5 rounded font-medium">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
              {stats && (
                <div className="mt-4 pt-3 border-t border-border-setl8">
                  <p className="text-[11px] text-text-muted">
                    Last refreshed: {formatDateTime(new Date())}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
