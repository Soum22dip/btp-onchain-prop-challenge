'use client';

import { useQuery } from '@tanstack/react-query';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { PageShell } from '@/components/layout/PageShell';
import { getMarketMonitor } from '@/lib/api';
import type { MarketMonitorData, MarketFeedStatus } from '@/lib/types';
import { cn, formatNumber, formatDateTime } from '@/lib/utils';
import {
  Loader2,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle,
  Activity,
  Clock,
} from 'lucide-react';

function ConnectionBadge({ connected, label }: { connected: boolean; label: string }) {
  return (
    <div
      className={cn(
        'glass-card rounded-xl p-5 flex items-center gap-4',
        connected ? 'border-success/20' : 'border-danger/20',
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center',
          connected ? 'bg-success/10' : 'bg-danger/10',
        )}
      >
        {connected ? (
          <Wifi size={20} className="text-success" />
        ) : (
          <WifiOff size={20} className="text-danger" />
        )}
      </div>
      <div>
        <p className="text-white text-sm font-medium">{label}</p>
        <p className={cn('text-xs', connected ? 'text-success' : 'text-danger')}>
          {connected ? 'Connected' : 'Disconnected'}
        </p>
      </div>
    </div>
  );
}

function StalenessIndicator({ feed }: { feed: MarketFeedStatus }) {
  const staleSeconds = Math.floor(feed.staleSinceMs / 1000);
  const isStale = feed.isStale;
  const isCritical = staleSeconds > 60;

  return (
    <div className="flex items-center gap-1.5">
      {isStale ? (
        <AlertTriangle size={12} className={isCritical ? 'text-danger' : 'text-warning'} />
      ) : (
        <CheckCircle size={12} className="text-success" />
      )}
      <span
        className={cn(
          'text-xs number-font',
          isStale
            ? isCritical
              ? 'text-danger'
              : 'text-warning'
            : 'text-success',
        )}
      >
        {isStale ? `${staleSeconds}s ago` : 'Live'}
      </span>
    </div>
  );
}

export default function MarketMonitorPage() {
  const { checked, isAuthenticated } = useAdminAuth();

  const { data, isLoading } = useQuery<MarketMonitorData>({
    queryKey: ['market-monitor'],
    queryFn: getMarketMonitor,
    refetchInterval: 5000,
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

  const feeds = Array.isArray(data?.feeds) ? data.feeds : [];
  const staleFeeds = feeds.filter((f) => f.isStale);
  const categoryCounts = data?.categoryCounts ?? {};

  return (
    <PageShell
      title="Market Monitor"
      subtitle="Live price feed status and health monitoring"
      actions={
        <div className="flex items-center gap-2">
          {(data?.staleCount ?? 0) > 0 && (
            <span className="flex items-center gap-1.5 bg-danger/10 text-danger text-xs px-3 py-1.5 rounded-lg">
              <AlertTriangle size={12} />
              {data?.staleCount} stale
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Connection Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ConnectionBadge
            connected={data?.bybitConnected ?? false}
            label="Bybit WebSocket"
          />
          <ConnectionBadge
            connected={data?.finnhubConnected ?? false}
            label="Finnhub WebSocket"
          />
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={14} className="text-primary" />
              <span className="text-text-secondary text-xs">Total Markets</span>
            </div>
            <p className="text-xl font-bold text-white number-font">
              {data?.totalMarkets ?? 0}
            </p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={14} className="text-success" />
              <span className="text-text-secondary text-xs">Healthy</span>
            </div>
            <p className="text-xl font-bold text-success number-font">
              {feeds.length - staleFeeds.length}
            </p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-danger" />
              <span className="text-text-secondary text-xs">Stale (&gt;30s)</span>
            </div>
            <p className="text-xl font-bold text-danger number-font">
              {staleFeeds.length}
            </p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={14} className="text-text-secondary" />
              <span className="text-text-secondary text-xs">Categories</span>
            </div>
            <p className="text-xl font-bold text-white number-font">
              {Object.keys(categoryCounts).length}
            </p>
          </div>
        </div>

        {/* Category Breakdown */}
        {Object.keys(categoryCounts).length > 0 && (
          <div className="glass-card rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Markets by Category</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(categoryCounts).map(([category, count]) => (
                <div
                  key={category}
                  className="bg-surface-2/50 border border-border-setl8 rounded-lg px-3 py-2"
                >
                  <span className="text-text-secondary text-xs">{category}</span>
                  <span className="text-white text-sm font-semibold ml-2 number-font">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Price Feed Table */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border-setl8">
            <h2 className="text-sm font-semibold text-white">Price Feeds</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-setl8 bg-surface-2/50">
                  <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Symbol</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Category</th>
                  <th className="text-right px-4 py-3 text-text-secondary font-medium text-xs">Last Price</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Source</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">Last Updated</th>
                  <th className="text-center px-4 py-3 text-text-secondary font-medium text-xs">Status</th>
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
                ) : feeds.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-secondary text-sm">
                      No market feeds available
                      <br />
                      <span className="text-text-muted text-xs">
                        {/* TODO: needs backend endpoint GET /api/admin/market/status */}
                        Waiting for backend endpoint
                      </span>
                    </td>
                  </tr>
                ) : (
                  (Array.isArray(feeds) ? feeds : []).map((feed) => (
                    <tr
                      key={feed.symbol}
                      className={cn(
                        'border-b border-border-setl8 last:border-0 hover:bg-white/[0.015] transition-colors',
                        feed.isStale && 'bg-danger/[0.03]',
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className="text-white font-medium text-xs">{feed.symbol}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-text-secondary text-xs">{feed.category}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-white number-font text-xs">
                        ${formatNumber(feed.lastPrice, feed.lastPrice < 1 ? 6 : 2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-text-muted text-xs">{feed.source}</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {formatDateTime(feed.lastUpdated)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <StalenessIndicator feed={feed} />
                        </div>
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
