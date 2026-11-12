'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  PartyPopper,
} from 'lucide-react';
import {
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TokenAccountNotFoundError } from '@solana/spl-token';
import { cn, formatUsd, getSolscanTxUrl } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { getAttempts, createAttempt } from '@/lib/api';
import { buildPurchaseTransaction } from '@/lib/solana-purchase';
import { EVALUATION_PACKAGES, TOKEN_INFO } from '@setl8/constants';
import { TokenSymbol } from '@setl8/types';
import type { EvaluationPackage } from '@setl8/types';
import type { Attempt } from '@setl8/types';
import { AttemptStatus } from '@setl8/types';
import PackageSelector from '@/components/challenge/PackageSelector';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? 'devnet') as 'devnet' | 'mainnet-beta';

function formatPurchaseError(message: string): string {
  if (message.includes('AttemptStillActive') || message.includes('6016') || message.includes('0x1780')) {
    return 'You already have an active challenge. Head to the trading terminal to continue trading.';
  }
  // SPL Token "insufficient funds" is custom program error 0x1 from the
  // token program specifically. Match the full phrase, not just "0x1" —
  // that substring would also match 0x10, 0x100, 0x1780, etc.
  if (
    message.toLowerCase().includes('insufficient funds') ||
    message.includes('TokenInsufficientFunds')
  ) {
    return 'Insufficient token balance. Please add funds to your wallet and try again.';
  }
  if (message.includes('not confirmed') || message.includes('timeout') || message.includes('Timed out')) {
    return 'Transaction timed out. It may still succeed — check Solana Explorer with your transaction signature.';
  }
  if (message.includes('Program log:') || message.includes('custom program error')) {
    return 'Transaction failed on-chain. Please try again or contact support.';
  }
  if (message.includes('User rejected')) {
    return 'Transaction cancelled — you declined the wallet prompt.';
  }
  return message;
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <div
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-all',
              i + 1 === current
                ? 'bg-primary text-white'
                : i + 1 < current
                ? 'bg-success text-white'
                : 'bg-surface border border-border-setl8 text-text-secondary',
            )}
          >
            {i + 1 < current ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={cn('h-px flex-1 transition-colors', i + 1 < current ? 'bg-success' : 'bg-border-setl8')}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token selector
// ---------------------------------------------------------------------------

function TokenSelector({
  selected,
  onSelect,
}: {
  selected: TokenSymbol;
  onSelect: (t: TokenSymbol) => void;
}) {
  const tokens = [TokenSymbol.USDT, TokenSymbol.USDC, TokenSymbol.USD1] as const;
  return (
    <div className="flex gap-3">
      {tokens.map((token) => (
        <button
          key={token}
          onClick={() => onSelect(token)}
          className={cn(
            'flex-1 py-4 rounded-xl border text-sm font-semibold transition-all',
            selected === token
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border-setl8 bg-surface text-text-secondary hover:border-primary/40 hover:text-white',
          )}
        >
          {token}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Challenge page
// ---------------------------------------------------------------------------

export default function ChallengePage() {
  const router = useRouter();
  const { isAuthenticated, trader } = useAuth();
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();

  const [step, setStep] = useState(1);
  const [selectedPkg, setSelectedPkg] = useState<EvaluationPackage | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenSymbol>(TokenSymbol.USDT);
  const [activeAttempt, setActiveAttempt] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check for existing active attempt
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    getAttempts()
      .then((attempts) => {
        const safeAttempts = Array.isArray(attempts) ? attempts : [];
        const active = safeAttempts.find((a) => a.status === AttemptStatus.Active);
        if (active) setActiveAttempt(active as Attempt);
      })
      .catch(() => {
        // ignore
      })
      .finally(() => setLoading(false));
  }, [isAuthenticated, router]);

  const handlePay = useCallback(async () => {
    if (!selectedPkg || !publicKey || !signTransaction) {
      setError('Wallet not connected or package not selected');
      return;
    }

    setError(null);
    setPaying(true);

    try {
      const feeAmountUsd = selectedPkg.priceCents / 100;
      // priceCents → 6-decimal token units: 1 cent = 10_000 base units.
      // Stays in BigInt math so fractional-cent prices won't blow up.
      const feeUnits = BigInt(selectedPkg.priceCents) * 10_000n;

      // Preflight: read the trader's token balance at the exact mint we're
      // about to transfer from. If we skip this, the only failure signal is
      // an opaque program log we can't distinguish from other on-chain errors.
      const mintAddress =
        SOLANA_NETWORK === 'devnet'
          ? TOKEN_INFO[selectedToken].devnetMint
          : TOKEN_INFO[selectedToken].mainnetMint;
      const mintPubkey = new PublicKey(mintAddress);
      const traderAta = await getAssociatedTokenAddress(mintPubkey, publicKey);

      let balanceUnits = 0n;
      try {
        const account = await getAccount(connection, traderAta);
        balanceUnits = account.amount;
      } catch (err) {
        if (!(err instanceof TokenAccountNotFoundError)) throw err;
        // ATA missing → balance is 0, fall through to the check below.
      }

      if (balanceUnits < feeUnits) {
        const haveUi = Number(balanceUnits) / 1_000_000;
        setError(
          `Insufficient ${selectedToken} balance. You have ${haveUi.toFixed(2)} ${selectedToken}, need ${feeAmountUsd.toFixed(2)}.`,
        );
        setPaying(false);
        return;
      }

      // 1. Build on-chain deposit_evaluation_fee transaction
      const tx = await buildPurchaseTransaction({
        walletPublicKey: publicKey,
        feeAmountUsd,
        accountSizeUsd: selectedPkg.accountSize,
        tokenSymbol: selectedToken,
        connection,
      });

      // 2. Sign with wallet
      const signedTx = await signTransaction(tx);

      // 3. Send — returns signature immediately
      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      setTxSignature(sig);

      // 4. Call backend IMMEDIATELY — don't wait for on-chain confirmation
      try {
        await createAttempt({
          txSignature: sig,
          accountSizeUsd: selectedPkg.accountSize,
          tokenSymbol: selectedToken,
        });
      } catch (backendErr) {
        console.error('Backend createAttempt failed, tx was sent:', sig, backendErr);
        // Don't fail — the on-chain tx happened
      }

      // 5. Show success right away
      setSuccess(true);

      // 6. Confirm in background (non-blocking)
      connection.confirmTransaction(sig, 'confirmed').catch(() => {
        console.warn('Confirmation polling timed out — tx may still be valid:', sig);
      });
    } catch (e) {
      console.error('[challenge] purchase failed:', e);
      const raw = e instanceof Error ? e.message : 'Transaction failed. Please try again.';
      setError(formatPurchaseError(raw));
    } finally {
      setPaying(false);
    }
  }, [selectedPkg, publicKey, signTransaction, selectedToken, connection]);

  if (!isAuthenticated) return null;

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <div className="w-20 h-20 rounded-2xl bg-success/10 border border-success/30 flex items-center justify-center mx-auto mb-6">
            <PartyPopper className="w-10 h-10 text-success" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Challenge Started!</h1>
          <p className="text-text-secondary mb-6">
            Your {selectedPkg && formatUsd(selectedPkg.accountSize, 0)} synthetic account is ready.
            Hit 8% profit to pass your first evaluation.
          </p>
          {txSignature && (
            <a
              href={getSolscanTxUrl(txSignature, SOLANA_NETWORK)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary text-sm hover:underline mb-6"
            >
              <ExternalLink className="w-4 h-4" />
              View transaction on Solscan
            </a>
          )}
          <Link href="/dashboard" className="btn-primary w-full flex items-center justify-center gap-2 mt-6">
            Go to Dashboard
            <ChevronRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    );
  }

  // Already has active attempt
  if (activeAttempt) {
    const terminalUrl = typeof window !== 'undefined' && window.location.hostname === 'setl8.com'
      ? 'https://trade.setl8.com'
      : 'http://localhost:3002';

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Challenge Active</h1>
          <p className="text-text-secondary mb-6">
            You have an active {formatUsd(Number(activeAttempt.accountSize), 0)} challenge (Attempt #{activeAttempt.attemptNumber}).
            Head to the terminal to keep trading.
          </p>
          <a
            href={terminalUrl}
            className="btn-primary w-full flex items-center justify-center gap-2 mb-3"
          >
            Open Trading Terminal
            <ExternalLink className="w-4 h-4" />
          </a>
          <Link href="/dashboard" className="btn-secondary w-full flex items-center justify-center gap-2">
            View Dashboard
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-text-secondary hover:text-white text-sm mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-white mb-2">Buy a Challenge</h1>
        <p className="text-text-secondary">
          Choose your account size, pick a token, and start trading.
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <StepIndicator current={step} total={3} />
      </div>

      {/* Step 1: Package selector */}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <h2 className="text-xl font-semibold text-white mb-4">Select Account Size</h2>
            <PackageSelector
              selected={selectedPkg}
              onSelect={(pkg) => {
                setSelectedPkg(pkg);
                setStep(2);
              }}
            />
          </motion.div>
        )}

        {/* Step 2: Token selector */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-md"
          >
            <h2 className="text-xl font-semibold text-white mb-4">Select Payment Token</h2>
            <p className="text-text-secondary text-sm mb-6">
              Pay your evaluation fee in USDT, USDC, or USD1 (SPL token on Solana).
            </p>
            <TokenSelector selected={selectedToken} onSelect={setSelectedToken} />

            <div className="mt-4 card p-4">
              <div className="flex items-center gap-2 text-text-secondary text-xs">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Make sure you have {selectedPkg ? formatUsd(selectedPkg.priceCents / 100, 0) : '...'} {selectedToken} in your wallet before continuing.
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(1)} className="btn-secondary">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setStep(3)} className="btn-primary flex items-center gap-2 flex-1 justify-center">
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Review & Pay */}
        {step === 3 && selectedPkg && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-md"
          >
            <h2 className="text-xl font-semibold text-white mb-6">Review & Pay</h2>

            {/* Summary card */}
            <div className="card p-6 space-y-4 mb-6">
              <div className="flex justify-between">
                <span className="text-text-secondary text-sm">Account Size</span>
                <span className="text-white font-semibold number-font">{formatUsd(selectedPkg.accountSize, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary text-sm">Payment Token</span>
                <span className="text-white font-semibold">{selectedToken}</span>
              </div>
              <div className="border-t border-border-setl8" />
              <div className="flex justify-between">
                <span className="text-text-secondary text-sm">Fee to Pay</span>
                <span className="text-primary font-bold text-xl number-font">
                  {formatUsd(selectedPkg.priceCents / 100, 0)} {selectedToken}
                </span>
              </div>
            </div>

            {/* Rules reminder */}
            <div className="card p-4 mb-6 space-y-2">
              <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-2">Rules</div>
              {[
                `Profit target: +8% to pass`,
                `Max drawdown: -8% (you fail)`,
                `No daily stopout`,
                `6 total phases`,
                `Payouts from phase 2`,
              ].map((rule) => (
                <div key={rule} className="flex items-center gap-2 text-sm text-text-secondary">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                  {rule}
                </div>
              ))}
            </div>

            {error && (
              <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-4 mb-4 text-sm">
                {error}
              </div>
            )}

            {!connected ? (
              <div className="bg-warning/10 border border-warning/30 text-warning rounded-xl p-4 mb-4 text-sm text-center">
                Please connect your wallet to continue
              </div>
            ) : null}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-secondary">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handlePay}
                disabled={paying || !connected}
                className="btn-primary flex items-center justify-center gap-2 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {paying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Pay {formatUsd(selectedPkg.priceCents / 100, 0)} {selectedToken}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
