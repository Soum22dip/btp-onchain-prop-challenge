'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { PageShell } from '@/components/layout/PageShell';
import { getFraudFlags } from '@/lib/api';
import type { FraudFlagRecord, FraudFlaggedTrader } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type SeverityKey = 'LOW' | 'MEDIUM' | 'HIGH';
type FilterTab = 'all' | 'unresolved' | 'high';

const SEVERITY_MAP: Record<string, SeverityKey> = {
  UNUSUAL_PNL: 'HIGH',
  RAPID_OPEN_CLOSE: 'MEDIUM',
  SUSPICIOUS_PATTERN: 'HIGH',
  MULTIPLE_ACCOUNTS: 'HIGH',
};

const SEVERITY_BADGE: Record<SeverityKey, string> = {
  LOW: 'bg-surface-2 text-text-secondary',
  MEDIUM: 'bg-warning/10 text-warning',
  HIGH: 'bg-danger/10 text-danger',
};

function getSeverity(flag: string): SeverityKey {
  return SEVERITY_MAP[flag] ?? 'LOW';
}

interface FlatFraudRow {
  traderId: string;
  walletAddress: string;
  traderStatus: string;
  record: FraudFlagRecord;
  severity: SeverityKey;
}

function flattenRows(traders: FraudFlaggedTrader[]): FlatFraudRow[] {
  const rows: FlatFraudRow[] = [];
  for (const trader of traders) {
    const records = Array.isArray(trader.fraudFlagRecords) ? trader.fraudFlagRecords : [];
    for (const record of records) {
      rows.push({
        traderId: trader.id,
        walletAddress: trader.walletAddress,
        traderStatus: trader.status,
        record,
        severity: getSeverity(record.flag),
      });
    }
    // If no flag records, still show the trader with basic info
    const flags = Array.isArray(trader.fraudFlags) ? trader.fraudFlags : [];
    if (records.length === 0 && flags.length > 0) {
      for (const flag of flags) {
        rows.push({
          traderId: trader.id,
          walletAddress: trader.walletAddress,
          traderStatus: trader.status,
          record: {
            flag,
            notes: null,
            flaggedAt: trader.updatedAt,
            flaggedBy: null,
          },
          severity: getSeverity(flag),
        });
      }
    }
  }
  return rows;
}

export default function FraudPage() {
  const { checked, isAuthenticated } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['fraud'],
    queryFn: getFraudFlags,
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

  const traders = Array.isArray(data?.items) ? data.items : [];
  const allRows = flattenRows(traders);

  const unresolvedRows = allRows.filter((r) => !r.record.notes?.includes('resolved'));
  const highRows = allRows.filter((r) => r.severity === 'HIGH');

  const displayRows =
    activeTab === 'unresolved'
      ? unresolvedRows
      : activeTab === 'high'
      ? highRows
      : allRows;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allRows.length },
    { key: 'unresolved', label: 'Unresolved', count: unresolvedRows.length },
    { key: 'high', label: 'High Severity', count: highRows.length },
  ];

  return (
    <PageShell
      title="Fraud Flags"
      subtitle="Flagged trader activity for review"
    >
      {/* Summary chips */}
      <div className="flex items-center gap-3 mb-4">
        <div className="px-3 py-1.5 bg-surface border border-border-setl8 rounded-lg">
          <span className="text-text-secondary text-xs">Total: </span>
          <span className="text-white text-sm font-semibold">{allRows.length}</span>
        </div>
        <div className="px-3 py-1.5 bg-surface border border-border-setl8 rounded-lg">
          <span className="text-text-secondary text-xs">Unresolved: </span>
          <span className="text-warning text-sm font-semibold">{unresolvedRows.length}</span>
        </div>
        <div className="px-3 py-1.5 bg-surface border border-border-setl8 rounded-lg">
          <span className="text-text-secondary text-xs">High Severity: </span>
          <span className="text-danger text-sm font-semibold">{highRows.length}</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-border-setl8">
        {tabs.map((tab) => (
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
      <div className="bg-surface border border-border-setl8 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-border-setl8">
                <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">
                  Wallet
                </th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">
                  Reason
                </th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">
                  Severity
                </th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">
                  Flagged
                </th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium text-xs">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border-setl8">
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-surface-2 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : displayRows.length === 0
                ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-text-secondary text-sm"
                      >
                        No fraud flags
                      </td>
                    </tr>
                  )
                : displayRows.map((row, idx) => (
                    <tr
                      key={`${row.traderId}-${row.record.flag}-${idx}`}
                      className="border-b border-border-setl8 last:border-0 hover:bg-surface-2 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-white">
                          {row.walletAddress.slice(0, 6)}...
                          {row.walletAddress.slice(-6)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-text-secondary">
                          {row.record.flag.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'text-[11px] font-medium px-2 py-0.5 rounded',
                            SEVERITY_BADGE[row.severity],
                          )}
                        >
                          {row.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {formatDateTime(row.record.flaggedAt)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs max-w-[200px] truncate">
                        {row.record.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
