'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, ExternalLink, Clock, TrendingUp, DollarSign, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn, formatUsd, formatNumber, formatCountdown, truncateAddress } from '@/lib/utils';
import { getVaultBalance, getVaultNextPayout, getOverviewStats } from '@/lib/api';
import type { VaultBalance, VaultNextPayout } from '@/lib/api';
import type { OverviewStats } from '@setl8/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAYOUT_VAULT = process.env.NEXT_PUBLIC_PAYOUT_VAULT ?? 'BMHggqxZUgjMEwev5z8YDbFsd6LvTFdZu2SB7B4n7Z1e';
const SOLSCAN_URL = `https://solscan.io/account/${PAYOUT_VAULT}?cluster=devnet`;

// ---------------------------------------------------------------------------
// Token balance card
// ---------------------------------------------------------------------------

interface TokenBalanceCardProps {
  symbol: string;
  balance: number;
  color: string;
}

function TokenBalanceCard({ symbol, balance, color }: TokenBalanceCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-6 flex items-center gap-4"
    >
      <div
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm',
          color,
        )}
      >
        {symbol}
      </div>
      <div>
        <div className="text-text-secondary text-sm mb-0.5">{symbol} Balance</div>
        <div className="text-2xl font-bold text-white number-font">{formatUsd(balance)}</div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Animated circular countdown clock
// ---------------------------------------------------------------------------

const COUNTDOWN_SIZE = 220;
const STROKE_WIDTH = 8;
const RADIUS = (COUNTDOWN_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface CountdownClockProps {
  targetDate: Date | string;
  pendingCount: number;
  pendingAmountUsd: number;
}

function CountdownClock({ targetDate, pendingCount, pendingAmountUsd }: CountdownClockProps) {
  // Initialize with 0 to avoid hydration mismatch — real value set on mount
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = new Date(targetDate).getTime();
  const totalCycleDuration = 5 * 24 * 60 * 60 * 1000; // 5-day payout cycle
  const remaining = Math.max(0, target - now);
  const progress = 1 - remaining / totalCycleDuration;
  const dashOffset = CIRCUMFERENCE * (1 - Math.min(progress, 1));

  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((remaining / (1000 * 60)) % 60);
  const seconds = Math.floor((remaining / 1000) % 60);

  const daysLeft = remaining / (1000 * 60 * 60 * 24);
  const ringColor = daysLeft > 2 ? '#22c55e' : daysLeft > 1 ? '#eab308' : '#ef4444';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="card p-8 mb-8 flex flex-col items-center"
    >
      <div className="relative" style={{ width: COUNTDOWN_SIZE, height: COUNTDOWN_SIZE }}>
        {/* Background ring */}
        <svg
          width={COUNTDOWN_SIZE}
          height={COUNTDOWN_SIZE}
          className="absolute inset-0"
        >
          <circle
            cx={COUNTDOWN_SIZE / 2}
            cy={COUNTDOWN_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={STROKE_WIDTH}
          />
        </svg>
        {/* Animated progress ring */}
        <svg
          width={COUNTDOWN_SIZE}
          height={COUNTDOWN_SIZE}
          className="absolute inset-0 -rotate-90"
          style={{ animation: 'pulse-ring 3s ease-in-out infinite' }}
        >
          <circle
            cx={COUNTDOWN_SIZE / 2}
            cy={COUNTDOWN_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-black text-white number-font tracking-wider">
            {String(days).padStart(2, '0')}:{String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
          <div className="text-text-secondary text-[10px] uppercase tracking-widest mt-1">DD : HH : MM : SS</div>
        </div>
      </div>
      <div className="text-text-secondary text-sm mt-4 font-medium">Until Next Payout Batch</div>
      <div className="flex items-center gap-4 mt-3 text-xs text-text-secondary">
        <span>{pendingCount} requests pending</span>
        <span className="text-primary font-semibold number-font">{formatUsd(pendingAmountUsd)} queued</span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Vault health meter
// ---------------------------------------------------------------------------

const TARGET_VAULT_SIZE = 500_000;

interface VaultHealthMeterProps {
  balance: number;
}

function VaultHealthMeter({ balance }: VaultHealthMeterProps) {
  const [animatedFill, setAnimatedFill] = useState(0);
  const safeBalance = Number(balance) || 0;
  const fillPercent = Math.min((safeBalance / TARGET_VAULT_SIZE) * 100, 100);

  useEffect(() => {
    const timeout = setTimeout(() => setAnimatedFill(fillPercent), 200);
    return () => clearTimeout(timeout);
  }, [fillPercent]);

  const getStatus = (pct: number) => {
    if (pct >= 70) return { label: 'Strong', color: 'text-green-500' };
    if (pct >= 30) return { label: 'Healthy', color: 'text-yellow-500' };
    return { label: 'Low', color: 'text-red-500' };
  };

  const status = getStatus(animatedFill);

  const graduations = [0, 125_000, 250_000, 375_000, 500_000];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="card p-6 mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="text-white font-semibold">Vault Health</div>
        <div className={cn('text-sm font-bold', status.color)}>{status.label}</div>
      </div>
      {/* Horizontal gauge */}
      <div className="relative h-8 bg-surface-2 rounded-full overflow-hidden border border-border-setl8">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${animatedFill}%`,
            background: `linear-gradient(90deg, #ef4444 0%, #eab308 40%, #22c55e 80%)`,
          }}
        />
        {/* Graduation marks */}
        {graduations.slice(1, -1).map((amt) => {
          const pos = (amt / TARGET_VAULT_SIZE) * 100;
          return (
            <div
              key={amt}
              className="absolute top-0 bottom-0 w-px bg-white/10"
              style={{ left: `${pos}%` }}
            />
          );
        })}
      </div>
      {/* Graduation labels */}
      <div className="flex justify-between mt-2">
        {graduations.map((amt) => (
          <div key={amt} className="text-text-secondary text-[10px] number-font">
            {formatUsd(amt, 0)}
          </div>
        ))}
      </div>
      <div className="mt-3 text-center text-text-secondary text-xs">
        {formatUsd(safeBalance, 0)} of {formatUsd(TARGET_VAULT_SIZE, 0)} target
        <span className="ml-2 text-white font-semibold number-font">{animatedFill.toFixed(1)}%</span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Vault page
// ---------------------------------------------------------------------------

export default function VaultPage() {
  const [vault, setVault] = useState<VaultBalance | null>(null);
  const [nextPayout, setNextPayout] = useState<VaultNextPayout | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async () => {
    setError(null);
    try {
      const [vaultRes, payoutRes, statsRes] = await Promise.allSettled([
        getVaultBalance(),
        getVaultNextPayout(),
        getOverviewStats(),
      ]);
      if (vaultRes.status === 'fulfilled') setVault(vaultRes.value);
      if (payoutRes.status === 'fulfilled') setNextPayout(payoutRes.value);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch vault data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="inline-flex items-center gap-2 bg-success/10 border border-success/30 text-success text-sm px-4 py-1.5 rounded-full mb-4">
          <Shield className="w-4 h-4" />
          Proof of Reserves
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          100% Transparent Vault
        </h1>
        <p className="text-text-secondary text-lg max-w-2xl mx-auto">
          Our payout vault is publicly visible on Solana at all times. Verify we can pay you
          before you even start trading.
        </p>
      </motion.div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-4 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Vault address card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card p-6 mb-6"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-2">
              Payout Vault Address
            </div>
            <div className="font-mono text-white text-sm break-all">{PAYOUT_VAULT}</div>
          </div>
          <a
            href={SOLSCAN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-success/10 border border-success/30 text-success px-4 py-2 rounded-lg hover:bg-success/20 transition-colors text-sm font-medium whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4" />
            View on Solscan
          </a>
        </div>
      </motion.div>

      {/* Vault health meter */}
      {vault && <VaultHealthMeter balance={vault.totalUsd} />}

      {/* Token balances */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-6 h-24 animate-pulse bg-surface" />
          ))}
        </div>
      ) : vault ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <TokenBalanceCard symbol="USDT" balance={Number(vault.usdt) || 0} color="bg-green-500/10 text-green-500" />
          <TokenBalanceCard symbol="USDC" balance={Number(vault.usdc) || 0} color="bg-blue-500/10 text-blue-500" />
          <TokenBalanceCard symbol="USD1" balance={Number(vault.usd1) || 0} color="bg-purple-500/10 text-purple-500" />
        </div>
      ) : null}

      {/* Total vault balance — hero number */}
      {vault && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-8 text-center mb-6 border-primary/20 bg-primary/5"
        >
          <div className="text-text-secondary text-sm uppercase tracking-wider mb-2">Total Vault Balance</div>
          <div className="text-5xl font-black text-white number-font mb-2">
            {formatUsd(Number(vault.totalUsd) || 0)}
          </div>
          {lastUpdated && (
            <div className="flex items-center justify-center gap-1.5 text-text-secondary text-xs mt-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Live — updated {lastUpdated.toLocaleTimeString()}
              <button
                onClick={() => void fetchData()}
                className="ml-2 hover:text-white transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: 'Total Deposited',
            value: stats ? formatUsd(Number(stats.totalVolumeUsd) || 0, 0) : '—',
            icon: TrendingUp,
            color: 'text-primary',
          },
          {
            label: 'Total Paid Out',
            value: stats ? formatUsd(Number(stats.totalPayoutsUsd) || 0, 0) : '—',
            icon: DollarSign,
            color: 'text-success',
          },
          {
            label: 'Active Traders',
            value: stats ? formatNumber(Number(stats.activeTraders) || 0) : '—',
            icon: Shield,
            color: 'text-warning',
          },
          {
            label: 'Next Payout In',
            value: nextPayout ? formatCountdown(nextPayout.nextBatchAt) : '—',
            icon: Clock,
            color: 'text-primary',
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="card p-5 text-center"
          >
            <stat.icon className={cn('w-5 h-5 mx-auto mb-2', stat.color)} />
            <div className="text-white font-bold text-lg number-font">{stat.value}</div>
            <div className="text-text-secondary text-xs mt-0.5">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Animated countdown clock */}
      {nextPayout && nextPayout.nextBatchAt && (
        <CountdownClock
          targetDate={nextPayout.nextBatchAt}
          pendingCount={nextPayout.pendingRequestCount}
          pendingAmountUsd={Number(nextPayout.pendingAmountUsd)}
        />
      )}

      {/* Why this matters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card p-8"
      >
        <h2 className="text-xl font-bold text-white mb-4">Why Onchain Transparency Matters</h2>
        <div className="space-y-4 text-text-secondary leading-relaxed">
          <p>
            Traditional prop firms hold your potential payouts in private accounts with no way
            for traders to verify funds actually exist. Setl8 is different.
          </p>
          <p>
            Every fee paid by traders is split onchain, atomically: 35% to our protocol wallet
            and 65% directly to the public payout vault. This split happens in a single transaction
            on the Solana blockchain, visible to anyone.
          </p>
          <p>
            Before you spend a single dollar on an evaluation, you can verify the vault has
            funds to pay you out. No trust required — the math is public.
          </p>
        </div>
        <div className="mt-6 space-y-3">
          {[
            'Vault balance visible to everyone, always',
            'Payouts processed onchain with public transaction IDs',
            '65% of every fee goes directly to payout vault',
            'Founder holds both keypairs — funds always accessible',
          ].map((point) => (
            <div key={point} className="flex items-center gap-2 text-sm text-text-secondary">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              {point}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
