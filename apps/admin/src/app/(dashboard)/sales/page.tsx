'use client';

import { useQuery } from '@tanstack/react-query';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { PageShell } from '@/components/layout/PageShell';
import { getChallengeSales } from '@/lib/api';
import { cn, formatUsd, formatDateTime } from '@/lib/utils';
import { Loader2, ExternalLink, TrendingUp, ShoppingCart, DollarSign } from 'lucide-react';
import { EVALUATION_PACKAGES } from '@setl8/constants';

const TIERS = EVALUATION_PACKAGES.map((pkg) => ({
  price: pkg.priceCents / 100,
  size: pkg.accountSize,
}));

type TokenKey = 'USDC' | 'USDT' | 'USD1';

const TOKEN_BADGE: Record<TokenKey, string> = {
  USDC: 'bg-blue-500/10 text-blue-400',
  USDT: 'bg-success/10 text-success',
  USD1: 'bg-primary/10 text-primary',
};

export default function SalesPage() {
  const { checked, isAuthenticated } = useAdminAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['challenge-sales'],
    queryFn: getChallengeSales,
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

  const sales = Array.isArray(data?.items) ? data.items : [];
  const totalRevenue = data?.totalRevenueUsd ?? 0;
  const revenueByTier = data?.revenueByTier ?? {};

  return (
    <PageShell
      title="Challenge Sales"
      subtitle="All challenge purchases and revenue breakdown"
      actions={
        <span className="text-text-secondary text-sm number-font">
          {data?.total ?? 0} sales
        </span>
      }
    >
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="glass-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-text-secondary text-xs font-medium">Total Revenue</span>
              <div className="bg-success/10 p-2 rounded-lg">
                <DollarSign size={16} className="text-success" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white number-font">{formatUsd(totalRevenue)}</p>
            <p className="text-text-muted text-xs mt-1">from challenge fees</p>
          </div>
          <div className="glass-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-text-secondary text-xs font-medium">Challenges Sold</span>
              <div className="bg-primary/10 p-2 rounded-lg">
                <ShoppingCart size={16} className="text-primary" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white number-font">{data?.total ?? 0}</p>
            <p className="text-text-muted text-xs mt-1">total purchases</p>
          </div>
          <div className="glass-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-text-secondary text-xs font-medium">Avg Sale</span>
              <div className="bg-info/10 p-2 rounded-lg">
                <TrendingUp size={16} className="text-info" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white number-font">
              {(data?.total ?? 0) > 0 ? formatUsd(totalRevenue / (data?.total ?? 1)) : '$0.00'}
            </p>
            <p className="text-text-muted text-xs mt-1">per challenge</p>
          </div>
        </div>

        {/* Revenue by Tier */}
        <div className="glass-card rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Revenue by Package Tier</h2>
          {/* TODO: needs backend endpoint */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {TIERS.map((tier) => {
              const tierKey = `${tier.size}`;
              const tierData = revenueByTier[tierKey];
              const count = tierData?.count ?? 0;
              const revenue = tierData?.revenue ?? 0;
              return (
                <div
                  key={tier.size}
                  className="bg-surface-2/50 border border-border-setl8 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-semibold">${tier.price}</span>
                    <span className="text-text-muted text-[10px] uppercase tracking-wider">
                      {formatUsd(tier.size, 0)}
                    </span>
                  </div>
                  <p className="text-white text-lg font-bold number-font">{count}</p>
                  <p className="text-text-muted text-xs number-font">{formatUsd(revenue)} revenue</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sales Table */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border-setl8">
            <h2 className="text-sm font-semibold text-white">Recent Purchases</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-setl8 bg-surface-2/50">
                  <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Date</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Wallet</th>
                  <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">Package</th>
                  <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">Price</th>
                  <th className="text-center px-4 py-3 text-text-secondary font-medium text-xs">Token</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border-setl8">
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-surface-2 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : sales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-secondary text-sm">
                      No challenge sales yet
                      <br />
                      <span className="text-text-muted text-xs">
                        {/* TODO: needs backend endpoint GET /api/admin/sales */}
                        Waiting for backend endpoint
                      </span>
                    </td>
                  </tr>
                ) : (
                  (Array.isArray(sales) ? sales : []).map((sale) => (
                    <tr
                      key={sale.id}
                      className="border-b border-border-setl8 last:border-0 hover:bg-white/[0.015] transition-colors"
                    >
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {formatDateTime(sale.purchasedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-white">
                            {sale.walletAddress.slice(0, 6)}...{sale.walletAddress.slice(-4)}
                          </span>
                          <a
                            href={`https://solscan.io/account/${sale.walletAddress}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-muted hover:text-text-secondary"
                          >
                            <ExternalLink size={11} />
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-white number-font">
                        {formatUsd(sale.accountSize, 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-white font-medium number-font">
                        {formatUsd(sale.priceUsd)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            'text-[11px] font-medium px-2 py-0.5 rounded',
                            TOKEN_BADGE[sale.tokenSymbol as TokenKey] ?? 'bg-surface-2 text-text-secondary',
                          )}
                        >
                          {sale.tokenSymbol}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`https://solscan.io/tx/${sale.txHash}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-text-muted hover:text-primary transition-colors"
                        >
                          {sale.txHash.slice(0, 8)}...{sale.txHash.slice(-4)}
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
