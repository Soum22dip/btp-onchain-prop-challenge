'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Shield,
  Zap,
  TrendingUp,
  CheckCircle2,
  ExternalLink,
  Users,
  DollarSign,
  Wallet,
  AlertTriangle,
  Lock,
  Eye,
  XCircle,
  ChevronDown,
  ChevronRight,
  Activity,
  BarChart3,
  Flame,
} from 'lucide-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { cn, formatUsd, formatNumber, formatPercent, truncateAddress, getSolscanTxUrl } from '@/lib/utils';
import { getVaultBalance, getOverviewStats, getRecentPayouts, type VaultBalance, type RecentPayout } from '@/lib/api';
import type { OverviewStats } from '@setl8/types';
import { EVALUATION_PACKAGES, PAYOUT_VAULT_ADDRESS } from '@setl8/constants';
import type { EvaluationPackage } from '@setl8/types';
import { useAuth } from '@/hooks/useAuth';
import VaultCounter from '@/components/landing/VaultCounter';
import FAQ from '@/components/landing/FAQ';
import PurchaseModal from '@/components/landing/PurchaseModal';

// ---------------------------------------------------------------------------
// Animated number counter
// ---------------------------------------------------------------------------

function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (value === 0) return;
    const duration = 1500;
    const startTime = Date.now();
    const diff = value;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(diff * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  return (
    <span className="number-font">
      {prefix}
      {displayed.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
      {suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  id,
  children,
  className,
  dark = false,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        'px-4 py-20 md:py-24',
        dark && 'bg-white/[0.01] border-y border-white/[0.03]',
        className,
      )}
    >
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
  );
}

function SectionHeader({
  badge,
  badgeIcon,
  title,
  subtitle,
}: {
  badge?: string;
  badgeIcon?: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="text-center mb-14">
      {badge && (
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 text-primary text-sm font-medium mb-4"
        >
          {badgeIcon}
          {badge}
        </motion.div>
      )}
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-3xl md:text-4xl font-bold mb-3"
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-text-secondary max-w-2xl mx-auto"
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// How It Works steps
// ---------------------------------------------------------------------------

const STEPS = [
  {
    number: '01',
    icon: Wallet,
    title: 'Buy a Challenge',
    description:
      'Pick your account size from $2,500 to $200,000. Pay the one-time fee in USDC, USDT, or USD1. Smart contract splits it: 65% to vault, 35% to protocol.',
  },
  {
    number: '02',
    icon: TrendingUp,
    title: 'Prove Yourself',
    description:
      'Hit 8% profit without breaching 8% drawdown. Trade 80+ markets across crypto, forex, metals, and indices. No daily stopout. No time limit.',
  },
  {
    number: '03',
    icon: DollarSign,
    title: 'Get Paid Automatically',
    description:
      'Smart contract fires every 5 days. No human approval needed. 100% payout split for your first 5 payouts. Code is the counterparty.',
  },
] as const;

// ---------------------------------------------------------------------------
// Pricing cards
// ---------------------------------------------------------------------------

const PACKAGE_BADGES: Record<
  number,
  { label: string; bg: string; text: string; prominent?: boolean }
> = {
  10_000: {
    label: 'Most Popular',
    bg: 'bg-primary',
    text: 'text-white',
    prominent: true,
  },
  50_000: { label: 'Best Value', bg: 'bg-success', text: 'text-white' },
};

function PricingCard({ pkg, index, onSelect }: { pkg: EvaluationPackage; index: number; onSelect: (pkg: EvaluationPackage) => void }) {
  const badge = PACKAGE_BADGES[pkg.accountSize];
  const isProminent = badge?.prominent;
  const priceUsd = pkg.priceCents / 100;
  const perPhasePayout = pkg.accountSize * 0.08; // 8% per funded phase
  const totalPayout    = pkg.accountSize * 0.40; // 40% across all 5 funded phases

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.06 }}
      className={cn(
        'relative rounded-xl border p-5 flex flex-col transition-all duration-200 hover:-translate-y-1',
        isProminent
          ? 'border-primary bg-primary/5 shadow-purple-glow'
          : 'border-white/[0.04] bg-white/[0.02] hover:border-primary/40',
      )}
    >
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <div
            className={cn(
              'text-[11px] font-semibold px-3 py-0.5 rounded-full whitespace-nowrap',
              badge.bg,
              badge.text,
            )}
          >
            {badge.label}
          </div>
        </div>
      )}

      <div className="mb-3">
        <div className="text-text-muted text-[10px] uppercase tracking-wider mb-1">
          Account Size
        </div>
        <div className="text-2xl font-bold text-white number-font">
          {formatUsd(pkg.accountSize, 0)}
        </div>
      </div>

      <div className="border-t border-white/[0.04] my-3" />

      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="text-text-muted text-[10px] mb-0.5">Fee</div>
          <div
            className={cn(
              'text-xl font-bold number-font',
              isProminent ? 'text-primary' : 'text-white',
            )}
          >
            {formatUsd(priceUsd, 0)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-text-muted text-[10px] mb-0.5">Per Phase</div>
          <div className="text-success text-base font-bold number-font">
            {formatUsd(perPhasePayout, 0)}
          </div>
        </div>
      </div>

      {/* Total payout potential */}
      <div className="flex items-center justify-between bg-success/[0.06] border border-success/[0.12] rounded-lg px-2.5 py-1.5 mb-3">
        <div className="text-text-muted text-[10px]">Total potential</div>
        <div className="text-success font-bold text-sm number-font">
          {formatUsd(totalPayout, 0)}{' '}
          <span className="text-text-muted font-normal text-[10px]">(40%)</span>
        </div>
      </div>

      <div className="text-text-muted text-[11px] mb-4">
        8% target · 100% payout split · 5 funded phases
      </div>

      <button
        onClick={() => onSelect(pkg)}
        className={cn(
          'w-full text-center py-2.5 rounded-lg text-sm font-semibold transition-colors mt-auto cursor-pointer',
          isProminent
            ? 'bg-primary hover:bg-primary-hover text-white'
            : 'bg-white/[0.04] border border-white/[0.06] hover:border-primary text-white',
        )}
      >
        Select
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Phase journey data + card
// ---------------------------------------------------------------------------

const PHASE_DATA = [
  { phase: 1, type: 'eval'   as const, label: 'Evaluation', payout: '—' },
  { phase: 2, type: 'funded' as const, label: 'Funded #1',  payout: '100%' },
  { phase: 3, type: 'funded' as const, label: 'Funded #2',  payout: '100%' },
  { phase: 4, type: 'funded' as const, label: 'Funded #3',  payout: '100%' },
  { phase: 5, type: 'funded' as const, label: 'Funded #4',  payout: '100%' },
  { phase: 6, type: 'funded' as const, label: 'Funded #5',  payout: '100%' },
];

function PhaseCard({
  phase,
  type,
  label,
  payout,
}: {
  phase: number;
  type: 'eval' | 'funded';
  label: string;
  payout: string;
}) {
  const isEval = type === 'eval';
  return (
    <div
      className={cn(
        'w-[118px] rounded-xl border p-3.5 flex flex-col gap-2',
        isEval
          ? 'border-white/[0.06] bg-white/[0.02]'
          : 'border-primary/25 bg-primary/5',
      )}
    >
      <div
        className={cn(
          'text-[9px] font-bold uppercase tracking-widest',
          isEval ? 'text-text-muted' : 'text-primary',
        )}
      >
        Phase {phase}
      </div>
      <div className="text-white font-semibold text-sm leading-tight">{label}</div>
      <div className="text-text-muted text-[10px]">8% target</div>
      <div
        className={cn(
          'text-[11px] font-semibold mt-auto pt-1 border-t',
          isEval
            ? 'text-text-muted border-white/[0.04]'
            : 'text-success border-success/10',
        )}
      >
        {payout}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Market icons/logos section
// ---------------------------------------------------------------------------

const MARKET_LOGOS = [
  { symbol: 'BTC', name: 'Bitcoin', color: '#F7931A' },
  { symbol: 'ETH', name: 'Ethereum', color: '#627EEA' },
  { symbol: 'SOL', name: 'Solana', color: '#9945FF' },
  { symbol: 'XRP', name: 'Ripple', color: '#23292F' },
  { symbol: 'EUR/USD', name: 'Euro', color: '#003399' },
  { symbol: 'GBP/USD', name: 'Pound', color: '#CF142B' },
  { symbol: 'XAU', name: 'Gold', color: '#FFD700' },
  { symbol: 'XAG', name: 'Silver', color: '#C0C0C0' },
  { symbol: 'SPY', name: 'S&P 500', color: '#0D6EFD' },
  { symbol: 'QQQ', name: 'Nasdaq', color: '#00A86B' },
  { symbol: 'DOGE', name: 'Dogecoin', color: '#C2A633' },
  { symbol: 'AVAX', name: 'Avalanche', color: '#E84142' },
] as const;

function MarketBubble({ symbol, name, color }: { symbol: string; name: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white text-xs font-bold border border-white/[0.06]"
        style={{ backgroundColor: `${color}20` }}
      >
        <span style={{ color }}>{symbol.length > 4 ? symbol.split('/')[0] : symbol}</span>
      </div>
      <span className="text-text-muted text-[10px]">{name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const { setVisible } = useWalletModal();
  const { isAuthenticated } = useAuth();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [vault, setVault] = useState<VaultBalance | null>(null);
  const [recentPayouts, setRecentPayouts] = useState<RecentPayout[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<EvaluationPackage | null>(null);

  useEffect(() => {
    Promise.allSettled([getOverviewStats(), getVaultBalance(), getRecentPayouts(6)]).then(
      ([statsRes, vaultRes, payoutsRes]) => {
        if (statsRes.status === 'fulfilled') setStats(statsRes.value);
        if (vaultRes.status === 'fulfilled') setVault(vaultRes.value);
        if (payoutsRes.status === 'fulfilled') setRecentPayouts(payoutsRes.value);
        setLoadingStats(false);
      },
    );
  }, []);

  useEffect(() => {
    if (!showAuthPrompt) return;
    const timer = setTimeout(() => setShowAuthPrompt(false), 5000);
    return () => clearTimeout(timer);
  }, [showAuthPrompt]);

  const handleCTA = () => {
    if (isAuthenticated) {
      const el = document.getElementById('packages');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else {
      setVisible(true);
    }
  };

  const handleSelectPackage = (pkg: EvaluationPackage) => {
    if (!isAuthenticated) {
      setShowAuthPrompt(true);
      return;
    }
    setSelectedPkg(pkg);
    setPurchaseModalOpen(true);
  };

  return (
    <div className="relative">
      {/* Background effects */}
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[600px] h-[600px] rounded-full opacity-[0.12] blur-[120px]"
          style={{
            background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)',
            top: '-10%',
            left: '-10%',
            animation: 'drift-orb-1 20s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-[0.10] blur-[100px]"
          style={{
            background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)',
            bottom: '-5%',
            right: '-10%',
            animation: 'drift-orb-2 25s ease-in-out infinite',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Auth prompt banner */}
      <AnimatePresence>
        {showAuthPrompt && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="sticky top-16 z-40 bg-warning/10 border-b border-warning/30 px-4 py-3"
          >
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2 text-warning text-sm font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Connect your wallet first to purchase a challenge
              </div>
              <button
                onClick={() => {
                  setShowAuthPrompt(false);
                  setVisible(true);
                }}
                className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
              >
                <Wallet className="w-3.5 h-3.5" />
                Connect Wallet
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================== */}
      {/* HERO */}
      {/* ================================================================== */}
      <section className="relative min-h-[92vh] flex flex-col items-center justify-center text-center px-4 pt-20 pb-12">
        <div className="max-w-4xl mx-auto">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary text-sm font-medium px-4 py-1.5 rounded-full mb-8"
          >
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Built on Solana · Devnet Live
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.1] tracking-tight mb-6"
          >
            <span className="text-gradient">Nobody</span> can stop
            <br />
            your withdrawal.
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Setl8 is the world&apos;s first DeFi prop firm. Payouts execute via Solana smart
            contract — no human approval, no delays, no excuses.
            <br className="hidden sm:block" />
            Code is the counterparty.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
          >
            <button
              onClick={handleCTA}
              className="btn-primary flex items-center gap-2 text-base px-8 py-3"
            >
              {isAuthenticated ? 'Start Challenge' : 'Connect Wallet'}
              <ArrowRight className="w-4 h-4" />
            </button>
            <Link
              href="/vault"
              className="btn-secondary flex items-center gap-2 text-base px-8 py-3"
            >
              <Shield className="w-4 h-4" />
              View Vault
            </Link>
          </motion.div>
        </div>

        {/* Vault Counter — the #1 conversion element */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-3xl mx-auto px-4"
        >
          <VaultCounter />
        </motion.div>
      </section>

      {/* ================================================================== */}
      {/* TRUST BAR */}
      {/* ================================================================== */}
      <section className="px-4 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.03] border border-white/[0.04] rounded-xl overflow-hidden">
            {[
              {
                icon: <Shield size={16} className="text-primary" />,
                text: '65% of fees go directly to payout vault',
              },
              {
                icon: <DollarSign size={16} className="text-success" />,
                text: '100% payout split for first 5 payouts',
              },
              {
                icon: <Zap size={16} className="text-primary" />,
                text: 'Zero spreads — trade at real market price',
              },
              {
                icon: <XCircle size={16} className="text-warning" />,
                text: 'No daily drawdown limit',
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white/[0.015] p-5 flex flex-col items-center text-center gap-2.5"
              >
                {item.icon}
                <span className="text-text-secondary text-xs sm:text-sm leading-snug">
                  {item.text}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* THE PROBLEM */}
      {/* ================================================================== */}
      <Section dark>
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6 leading-tight">
              Every prop firm has one fatal flaw:
              <br />
              <span className="text-danger">humans control the payout button.</span>
            </h2>
            <p className="text-text-secondary text-base md:text-lg leading-relaxed mb-6">
              Payout delays. Firms disappearing overnight. Traders posting screenshots
              because nobody believes they got paid. The trust problem isn&apos;t about
              better policies — it&apos;s a design flaw.
            </p>
            <div className="glass-card rounded-xl p-6 text-left max-w-xl mx-auto">
              <p className="text-white font-medium mb-2">
                Setl8&apos;s answer isn&apos;t a better policy.
              </p>
              <p className="text-text-secondary text-sm leading-relaxed">
                It&apos;s a different architecture. Every fee, every payout, every vault balance
                is onchain. The smart contract fires every 5 days. No human review. No
                approval queue. The code pays you or it doesn&apos;t run.
              </p>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* ================================================================== */}
      {/* HOW IT WORKS */}
      {/* ================================================================== */}
      <Section>
        <SectionHeader
          badge="Simple Process"
          badgeIcon={<Zap className="w-4 h-4" />}
          title="How It Works"
          subtitle="Three steps. No hidden criteria. No fine print."
        />

        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="glass-card glass-card-hover rounded-xl p-6 transition-all duration-200"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <step.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="text-4xl font-black text-white/[0.06]">{step.number}</div>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ================================================================== */}
      {/* JOURNEY TO LIVE CAPITAL */}
      {/* ================================================================== */}
      <Section dark>
        <SectionHeader
          badge="The Full Path"
          badgeIcon={<TrendingUp className="w-4 h-4" />}
          title="The Journey to Live Capital"
          subtitle="6 phases. 1 evaluation phase. 5 funded phases. Then live capital."
        />

        {/* Phase timeline — horizontally scrollable on mobile */}
        <div className="overflow-x-auto pb-4 -mx-4 px-4">
          <div className="flex items-start gap-3 min-w-max mx-auto w-fit">

            {/* EVALUATION group */}
            <div className="flex flex-col gap-2">
              <div className="text-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted bg-white/[0.04] border border-white/[0.06] px-3 py-1 rounded-full">
                  Evaluation
                </span>
              </div>
              <div className="flex gap-2">
                {PHASE_DATA.filter((p) => p.type === 'eval').map((p) => (
                  <PhaseCard key={p.phase} {...p} />
                ))}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center pt-11 text-text-muted px-1">
              <ChevronRight className="w-5 h-5" />
            </div>

            {/* FUNDED group */}
            <div className="flex flex-col gap-2">
              <div className="text-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
                  Funded — Get Paid
                </span>
              </div>
              <div className="flex gap-2">
                {PHASE_DATA.filter((p) => p.type === 'funded').map((p) => (
                  <PhaseCard key={p.phase} {...p} />
                ))}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center pt-11 text-text-muted px-1">
              <ChevronRight className="w-5 h-5" />
            </div>

            {/* Live capital destination */}
            <div className="flex flex-col gap-2">
              <div className="text-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-success bg-success/10 border border-success/20 px-3 py-1 rounded-full">
                  After Phase 6
                </span>
              </div>
              <div className="w-[118px] h-[120px] rounded-xl border border-success/30 bg-success/5 flex flex-col items-center justify-center gap-2 p-3 text-center">
                <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-success" />
                </div>
                <div className="text-success text-xs font-bold leading-tight">
                  Live Capital<br />Allocation
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Summary callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-8 rounded-2xl border border-primary/20 bg-primary/[0.04] p-6 max-w-2xl mx-auto text-center"
        >
          <div className="text-4xl font-black text-gradient mb-1 number-font">40%</div>
          <div className="text-white font-semibold mb-1.5">
            Cumulative payout potential across 5 funded phases
          </div>
          <div className="text-text-muted text-sm">
            100% profit split &nbsp;·&nbsp; Paid every 5 days via smart contract &nbsp;·&nbsp; No human approval
          </div>
        </motion.div>
      </Section>

      {/* ================================================================== */}
      {/* ACCOUNT PACKAGES */}
      {/* ================================================================== */}
      <Section id="packages">
        <SectionHeader
          title="Choose Your Account Size"
          subtitle="One-time fee. No subscriptions. No recurring charges."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {EVALUATION_PACKAGES.map((pkg, i) => (
            <PricingCard key={pkg.accountSize} pkg={pkg} index={i} onSelect={handleSelectPackage} />
          ))}
        </div>
      </Section>

      {/* ================================================================== */}
      {/* RULES */}
      {/* ================================================================== */}
      <Section dark>
        <SectionHeader
          title="Clear Rules. Fair Evaluation."
          subtitle="No hidden criteria. One simple target to hit."
        />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {[
            {
              label: 'Profit Target',
              value: '8%',
              desc: 'Per phase',
              color: 'text-success',
            },
            {
              label: 'Max Drawdown',
              value: '8%',
              desc: 'From peak equity',
              color: 'text-danger',
            },
            {
              label: 'Daily Drawdown',
              value: 'NONE',
              desc: 'Our advantage',
              color: 'text-warning',
              highlight: true,
            },
            {
              label: 'Time Limit',
              value: 'NONE',
              desc: 'Trade at your pace',
              color: 'text-warning',
            },
            {
              label: 'Payout Frequency',
              value: '5 days',
              desc: 'Auto by smart contract',
              color: 'text-primary',
            },
            {
              label: 'Payout Split',
              value: '100%',
              desc: 'First 5 payouts',
              color: 'text-success',
              highlight: true,
            },
            {
              label: 'Leverage',
              value: 'Up to 200x',
              desc: '50x crypto · 200x forex · 100x metals & indices',
              color: 'text-primary',
            },
            {
              label: 'Total Phases',
              value: '6',
              desc: '1 eval + 5 funded',
              color: 'text-primary',
            },
            {
              label: 'Max Cumulative Payout',
              value: '40%',
              desc: 'Across 5 funded phases',
              color: 'text-success',
              highlight: true,
            },
            {
              label: 'Spreads',
              value: 'ZERO',
              desc: 'Trade at real market price',
              color: 'text-primary',
              highlight: true,
            },
            {
              label: 'Fee Model',
              value: 'Open / Close',
              desc: 'Position-based, transparent',
              color: 'text-text-secondary',
            },
            {
              label: 'Hidden Fees',
              value: 'NONE',
              desc: 'No markup, no spread cost',
              color: 'text-warning',
            },
          ].map((rule, i) => (
            <motion.div
              key={rule.label}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                'glass-card rounded-xl p-5 text-center',
                rule.highlight && 'border-primary/20',
              )}
            >
              <div
                className={cn('text-2xl md:text-3xl font-black mb-2 number-font', rule.color)}
              >
                {rule.value}
              </div>
              <div className="text-white font-semibold text-sm mb-1">{rule.label}</div>
              <div className="text-text-muted text-xs">{rule.desc}</div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ================================================================== */}
      {/* VAULT / PROOF OF RESERVES */}
      {/* ================================================================== */}
      <Section>
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="inline-flex items-center gap-2 bg-success/10 border border-success/30 text-success text-sm px-4 py-1.5 rounded-full mb-6">
              <Shield className="w-4 h-4" />
              100% Transparent
            </div>

            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Don&apos;t trust us. Verify it yourself.
            </h2>
            <p className="text-text-secondary text-lg leading-relaxed mb-8 max-w-2xl mx-auto">
              The payout vault balance is publicly visible on the Solana blockchain at all
              times. Every deposit, every payout — fully auditable by anyone.
            </p>

            {/* Vault balance hero */}
            {vault && (
              <div className="glass-card rounded-2xl p-8 mb-8 max-w-md mx-auto">
                <div className="text-text-secondary text-sm mb-2">Payout Vault Balance</div>
                <div className="text-4xl font-bold text-white mb-4">
                  <AnimatedNumber value={vault.totalUsd} prefix="$" />
                </div>
                {/* Simple health bar */}
                <div className="relative h-2 bg-white/[0.04] rounded-full overflow-hidden mb-3">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-success to-primary rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min((vault.totalUsd / 50_000) * 100, 100)}%` }}
                  />
                </div>
                <div className="text-text-muted text-xs">Vault health meter</div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href={`https://solscan.io/account/${PAYOUT_VAULT_ADDRESS}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-success/10 border border-success/30 text-success px-6 py-3 rounded-xl hover:bg-success/20 transition-colors font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                View Vault on Solscan
              </a>
              <Link
                href="/vault"
                className="btn-secondary flex items-center gap-2"
              >
                Proof of Reserves
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="mt-4 text-text-muted text-sm">
              Vault address:{' '}
              <span className="font-mono text-text-secondary">
                {truncateAddress(PAYOUT_VAULT_ADDRESS, 8)}
              </span>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* ================================================================== */}
      {/* MARKETS */}
      {/* ================================================================== */}
      <Section dark>
        <SectionHeader
          badge="80+ Markets"
          badgeIcon={<Activity className="w-4 h-4" />}
          title="Trade crypto, forex, metals, and indices"
          subtitle="Real-time prices powered by Bybit + Finnhub. All markets synthetic — trade 24/7."
        />

        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8 mb-8">
          {MARKET_LOGOS.map((m) => (
            <motion.div
              key={m.symbol}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
            >
              <MarketBubble {...m} />
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <div className="inline-flex flex-wrap justify-center gap-2 text-text-muted text-xs">
            {['66 Crypto', '14 Forex', '2 Metals', '4 Indices'].map((cat) => (
              <span
                key={cat}
                className="bg-white/[0.03] border border-white/[0.04] px-3 py-1.5 rounded-lg"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* ================================================================== */}
      {/* SOCIAL PROOF — TRADERS ARE GETTING PAID */}
      {/* ================================================================== */}
      {recentPayouts.length > 0 && (
        <Section>
          <SectionHeader
            badge="Live Payouts"
            badgeIcon={<Flame className="w-4 h-4" />}
            title="Traders Are Getting Paid"
            subtitle="Real payouts processed by the Solana smart contract. Every payout is verifiable onchain."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {recentPayouts.slice(0, 6).map((payout, i) => {
              const hoursAgo = Math.floor((Date.now() - new Date(payout.processedAt).getTime()) / 3_600_000);
              const timeLabel = hoursAgo < 1 ? 'Just now' : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo / 24)}d ago`;

              return (
                <motion.div
                  key={payout.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="glass-card glass-card-hover rounded-xl p-5 transition-all duration-200"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-success/10 border border-success/20 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      </div>
                      <div>
                        <div className="font-mono text-white/70 text-xs">
                          {truncateAddress(payout.walletAddress)}
                        </div>
                        <div className="text-white/30 text-[10px]">{timeLabel}</div>
                      </div>
                    </div>
                    <a
                      href={getSolscanTxUrl(payout.txSignature, 'devnet')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-secondary hover:text-primary transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-success font-bold number-font text-lg">
                      +{formatUsd(payout.amountUsd)}
                    </div>
                    <span className="text-white/30 text-xs">{payout.tokenSymbol}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="text-center">
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors font-medium text-sm"
            >
              View all payouts & leaderboard
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </Section>
      )}

      {/* ================================================================== */}
      {/* FAQ */}
      {/* ================================================================== */}
      <Section>
        <SectionHeader
          title="Frequently Asked Questions"
          subtitle="Everything you need to know before starting."
        />
        <FAQ />
      </Section>

      {/* ================================================================== */}
      {/* FINAL CTA */}
      {/* ================================================================== */}
      <section className="px-4 py-24 text-center relative">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute w-[500px] h-[300px] rounded-full opacity-[0.08] blur-[100px] left-1/2 -translate-x-1/2 top-0"
            style={{
              background: 'radial-gradient(circle, #7c3aed, transparent)',
            }}
          />
        </div>

        <div className="max-w-2xl mx-auto relative">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-black mb-6"
          >
            Ready to prove your edge?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-text-secondary text-lg mb-10"
          >
            Start with as little as $30. Trade with up to $200,000 in synthetic capital.
            <br />
            Get paid automatically every 5 days.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            {isAuthenticated ? (
              <Link
                href="/challenge"
                className="btn-primary text-lg px-10 py-4 inline-flex items-center gap-3"
              >
                Start Your Challenge
                <ArrowRight className="w-5 h-5" />
              </Link>
            ) : (
              <button
                onClick={() => setVisible(true)}
                className="btn-primary text-lg px-10 py-4 inline-flex items-center gap-3"
              >
                Connect Wallet & Start
                <ArrowRight className="w-5 h-5" />
              </button>
            )}
          </motion.div>
        </div>
      </section>

      {/* Purchase Modal */}
      <PurchaseModal
        pkg={selectedPkg}
        isOpen={purchaseModalOpen}
        onClose={() => setPurchaseModalOpen(false)}
      />
    </div>
  );
}
