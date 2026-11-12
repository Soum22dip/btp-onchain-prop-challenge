'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { PageShell } from '@/components/layout/PageShell';
import { getVaultHealth, getOverviewStats } from '@/lib/api';
import type { VaultHealthData } from '@/lib/types';
import { formatUsd, formatDateTime, formatPercent } from '@/lib/utils';
import {
  Copy,
  ExternalLink,
  CheckCircle,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const VAULT_ADDRESS = 'BMHggqxZUgjMEwev5z8YDbFsd6LvTFdZu2SB7B4n7Z1e';

const TOKEN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  USDT: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/20' },
  USDC: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  USD1: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' },
};

export default function VaultPage() {
  const { checked, isAuthenticated } = useAdminAuth();
  const [copied, setCopied] = useState(false);

  const { data: vaultHealth, isLoading, dataUpdatedAt } = useQuery<VaultHealthData>({
    queryKey: ['vault-health'],
    queryFn: getVaultHealth,
    refetchInterval: 30000,
    enabled: isAuthenticated,
  });

  const { data: overviewStats } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: getOverviewStats,
    staleTime: 60000,
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

  const balances = Array.isArray(vaultHealth?.tokenBalances) ? vaultHealth.tokenBalances : [];
  const totalBalance = Number(vaultHealth?.currentBalance ?? 0) || 0;
  const totalInflow = Number(vaultHealth?.totalInflow ?? 0) || 0;
  const totalOutflow = Number(vaultHealth?.totalOutflow ?? 0) || 0;
  const netChange = Number(vaultHealth?.netChange ?? 0) || 0;
  const coverageRatio = Number(vaultHealth?.coverageRatio ?? 0) || 0;
  const expectedPayouts = Number(vaultHealth?.expectedPayouts ?? 0) || 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(VAULT_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <PageShell
      title="Vault Health"
      subtitle="Payout vault balance, inflow/outflow, and coverage"
    >
      <div className="space-y-6">
        {/* Vault Address */}
        <div className="glass-card rounded-xl p-5">
          <p className="text-text-secondary text-xs font-medium mb-2">
            Payout Vault Address
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-white break-all">
              {VAULT_ADDRESS}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-text-secondary hover:text-white transition-colors"
                title="Copy address"
              >
                {copied ? (
                  <CheckCircle size={14} className="text-success" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
              <a
                href={`https://solscan.io/account/${VAULT_ADDRESS}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-secondary hover:text-white transition-colors"
                title="View on Solscan"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>

        {/* Balance Hero + Health Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Total Balance */}
          <div className="glass-card rounded-xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-success dot-pulse" />
              <span className="text-text-secondary text-xs uppercase tracking-wider">
                Live Balance
              </span>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center h-14">
                <Loader2 className="animate-spin text-text-secondary" size={24} />
              </div>
            ) : (
              <p className="text-4xl font-bold text-white number-font">
                {formatUsd(totalBalance)}
              </p>
            )}
            <p className="text-text-secondary text-sm mt-2">Total Vault Balance</p>
            {dataUpdatedAt > 0 && (
              <p className="text-text-muted text-xs mt-1">
                Last updated: {formatDateTime(new Date(dataUpdatedAt))}
              </p>
            )}
          </div>

          {/* Inflow / Outflow */}
          <div className="glass-card rounded-xl p-5 space-y-4">
            <h3 className="text-text-secondary text-xs font-medium">Vault Flows</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpRight size={14} className="text-success" />
                  <span className="text-text-secondary text-sm">Inflow (65% fees)</span>
                </div>
                <span className="text-success number-font font-medium">
                  {formatUsd(totalInflow)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowDownRight size={14} className="text-danger" />
                  <span className="text-text-secondary text-sm">Outflow (payouts)</span>
                </div>
                <span className="text-danger number-font font-medium">
                  {formatUsd(totalOutflow)}
                </span>
              </div>
              <div className="border-t border-border-setl8 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary text-sm">Net Change</span>
                  <span
                    className={cn(
                      'number-font font-semibold',
                      netChange >= 0 ? 'text-success' : 'text-danger',
                    )}
                  >
                    {netChange >= 0 ? '+' : ''}{formatUsd(netChange)}
                  </span>
                </div>
              </div>
            </div>
            {/* TODO: needs backend endpoint for historical vault flow data */}
            <p className="text-text-muted text-[10px]">Needs backend endpoint for historical data</p>
          </div>

          {/* Coverage Ratio */}
          <div className="glass-card rounded-xl p-5 space-y-4">
            <h3 className="text-text-secondary text-xs font-medium">Coverage Health</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-text-secondary text-sm">Coverage Ratio</span>
                  <div className="flex items-center gap-1">
                    {isNaN(coverageRatio) || !isFinite(coverageRatio) ? (
                      <AlertTriangle size={12} className="text-danger" />
                    ) : coverageRatio >= 1.5 ? (
                      <Shield size={12} className="text-success" />
                    ) : coverageRatio >= 1.0 ? (
                      <AlertTriangle size={12} className="text-warning" />
                    ) : (
                      <AlertTriangle size={12} className="text-danger" />
                    )}
                    <span
                      className={cn(
                        'text-lg font-bold number-font',
                        isNaN(coverageRatio) || !isFinite(coverageRatio)
                          ? 'text-danger'
                          : coverageRatio >= 1.5
                          ? 'text-success'
                          : coverageRatio >= 1.0
                          ? 'text-warning'
                          : 'text-danger',
                      )}
                    >
                      {isNaN(coverageRatio) || !isFinite(coverageRatio) ? '\u2014' : `${coverageRatio.toFixed(2)}x`}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      isNaN(coverageRatio) || !isFinite(coverageRatio)
                        ? 'bg-danger'
                        : coverageRatio >= 1.5
                        ? 'bg-success'
                        : coverageRatio >= 1.0
                        ? 'bg-warning'
                        : 'bg-danger',
                    )}
                    style={{ width: `${isNaN(coverageRatio) || !isFinite(coverageRatio) ? 0 : Math.min(coverageRatio * 50, 100)}%` }}
                  />
                </div>
                <p className="text-text-muted text-[10px] mt-1">
                  Vault balance / expected payouts
                </p>
              </div>
              <div className="border-t border-border-setl8 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted text-xs">Expected Payouts</span>
                  <span className="text-text-secondary text-xs number-font">
                    {formatUsd(expectedPayouts)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted text-xs">Total Revenue</span>
                  <span className="text-text-secondary text-xs number-font">
                    {formatUsd(overviewStats?.totalVolumeUsd ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted text-xs">Paid Out</span>
                  <span className="text-text-secondary text-xs number-font">
                    {formatUsd(overviewStats?.totalPayoutsUsd ?? 0)}
                  </span>
                </div>
              </div>
            </div>
            {/* TODO: needs backend endpoint for coverage ratio calculation */}
          </div>
        </div>

        {/* Token Balance Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass-card rounded-xl p-5">
                  <div className="h-4 bg-surface-2 rounded animate-pulse mb-3 w-1/3" />
                  <div className="h-8 bg-surface-2 rounded animate-pulse" />
                </div>
              ))
            : balances.length === 0
            ? (
                <div className="col-span-3 text-center py-8 text-text-secondary text-sm">
                  No token balances found
                </div>
              )
            : (Array.isArray(balances) ? balances : []).map((balance) => {
                const colors = TOKEN_COLORS[balance.symbol] ?? {
                  bg: 'bg-surface-2',
                  text: 'text-text-secondary',
                  border: 'border-border-setl8',
                };
                return (
                  <div
                    key={balance.symbol}
                    className={cn(
                      'glass-card border rounded-xl p-5',
                      colors.border,
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={cn(
                          'text-sm font-semibold px-2 py-0.5 rounded',
                          colors.bg,
                          colors.text,
                        )}
                      >
                        {balance.symbol}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-white number-font">
                      {formatUsd(Number(balance.balanceUi ?? 0))}
                    </p>
                    <p className="text-text-muted text-xs mt-1 number-font">
                      {balance.balanceRaw ?? 0} raw
                    </p>
                  </div>
                );
              })}
        </div>
      </div>
    </PageShell>
  );
}
