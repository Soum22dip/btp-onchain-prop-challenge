'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ExternalLink, Users, Clock, DollarSign, CheckCircle2 } from 'lucide-react';
import { cn, formatUsd } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VaultCounterProps {
  /** ISO string for next vault fire */
  nextFireAt?: string;
  /** Traders waiting for payout */
  tradersInQueue?: number;
  /** Estimated payout in USD */
  estimatedPayout?: number;
  /** Last vault fire payout in USD */
  lastVaultPaid?: number;
  /** Number of traders paid in last vault fire */
  lastVaultTraders?: number;
  /** Solscan vault URL */
  vaultUrl?: string;
}

// ---------------------------------------------------------------------------
// Countdown logic — ticking every second
// ---------------------------------------------------------------------------

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getCountdown(targetIso: string | null | undefined): CountdownParts {
  if (!targetIso) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const target = new Date(targetIso);
  if (isNaN(target.getTime())) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Countdown digit display
// ---------------------------------------------------------------------------

function CountdownDigit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative bg-white/[0.04] border border-white/[0.06] rounded-lg w-[52px] h-[44px] sm:w-[60px] sm:h-[50px] flex items-center justify-center overflow-hidden">
        <span
          key={value}
          className="text-white text-xl sm:text-2xl font-bold number-font digit-flip"
        >
          {value}
        </span>
        {/* Divider line across middle */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.04]" />
      </div>
      <span className="text-text-muted text-[10px] uppercase tracking-widest mt-1.5 font-medium">
        {label}
      </span>
    </div>
  );
}

function CountdownSeparator() {
  return (
    <span className="text-text-muted text-xl font-bold pb-4 dot-pulse select-none">:</span>
  );
}

// ---------------------------------------------------------------------------
// VaultCounter component
// ---------------------------------------------------------------------------

export default function VaultCounter({
  nextFireAt,
  tradersInQueue = 8,
  estimatedPayout = 11_240,
  lastVaultPaid = 9_840,
  lastVaultTraders = 7,
  vaultUrl = 'https://solscan.io/account/BMHggqxZUgjMEwev5z8YDbFsd6LvTFdZu2SB7B4n7Z1e?cluster=devnet',
}: VaultCounterProps) {
  // Compute a default target: next 5-day cycle from a known epoch
  const getDefaultTarget = useCallback((): string => {
    const epochMs = new Date('2026-01-01T00:00:00Z').getTime();
    const intervalMs = 5 * 86_400_000;
    const now = Date.now();
    const cycles = Math.ceil((now - epochMs) / intervalMs);
    return new Date(epochMs + cycles * intervalMs).toISOString();
  }, []);

  const target = nextFireAt ?? getDefaultTarget();

  // Initialize with zeros to avoid hydration mismatch — server and client
  // will both render "00" on first paint, then the effect kicks in immediately.
  const [countdown, setCountdown] = useState<CountdownParts>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCountdown(getCountdown(target));
    const id = setInterval(() => setCountdown(getCountdown(target)), 1_000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      {/* Outer glow ring */}
      <div className="absolute -inset-px rounded-2xl vault-counter-glow pointer-events-none" />

      <div className="glass-card rounded-2xl p-5 sm:p-6 relative overflow-hidden">
        {/* Subtle gradient shimmer across the top */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(124,58,237,0.4), rgba(34,197,94,0.3), transparent)',
          }}
        />

        {/* Top bar: label + live dot + explorer link */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-success" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-success animate-ping opacity-40" />
            </div>
            <span className="text-text-secondary text-xs sm:text-sm font-semibold uppercase tracking-wider">
              Next Vault Opens In
            </span>
          </div>
          <a
            href={vaultUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-primary text-xs font-medium hover:underline transition-colors"
          >
            View on Solana Explorer
            <ExternalLink size={12} />
          </a>
        </div>

        {/* Countdown */}
        <div className={cn(
          'flex items-center justify-center gap-2 sm:gap-3 mb-6 transition-opacity duration-300',
          mounted ? 'opacity-100' : 'opacity-40',
        )}>
          <CountdownDigit value={pad(countdown.days)} label="Days" />
          <CountdownSeparator />
          <CountdownDigit value={pad(countdown.hours)} label="Hrs" />
          <CountdownSeparator />
          <CountdownDigit value={pad(countdown.minutes)} label="Min" />
          <CountdownSeparator />
          <CountdownDigit value={pad(countdown.seconds)} label="Sec" />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatChip
            icon={<Users size={14} className="text-primary" />}
            label="Traders in queue"
            value={(Number(tradersInQueue) || 0).toString()}
          />
          <StatChip
            icon={<DollarSign size={14} className="text-success" />}
            label="Est. payout"
            value={formatUsd(Number(estimatedPayout) || 0, 0)}
          />
          <StatChip
            icon={<CheckCircle2 size={14} className="text-success" />}
            label="Last vault"
            value={`${formatUsd(Number(lastVaultPaid) || 0, 0)} → ${Number(lastVaultTraders) || 0} traders`}
          />
          <StatChip
            icon={<Clock size={14} className="text-text-secondary" />}
            label="Cycle"
            value="Every 5 days"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat chip
// ---------------------------------------------------------------------------

function StatChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-text-muted text-[10px] uppercase tracking-wider font-medium">
          {label}
        </span>
      </div>
      <span className="text-white text-xs sm:text-sm font-semibold number-font">{value}</span>
    </div>
  );
}
