'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CheckCircle2,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import {
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '@/hooks/useAuth';
import { createAttempt } from '@/lib/api';
import { buildPurchaseTransaction } from '@/lib/solana-purchase';
import { formatUsd, truncateAddress, getSolscanTxUrl } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { EvaluationPackage } from '@setl8/types';
import { TokenSymbol } from '@setl8/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModalStep = 'details' | 'confirm' | 'processing' | 'success' | 'error';

interface PurchaseModalProps {
  pkg: EvaluationPackage | null;
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Token selector pills
// ---------------------------------------------------------------------------

const TOKENS: { symbol: TokenSymbol; label: string }[] = [
  { symbol: TokenSymbol.USDC, label: 'USDC' },
  { symbol: TokenSymbol.USDT, label: 'USDT' },
  { symbol: TokenSymbol.USD1, label: 'USD1' },
];

const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? 'devnet') as 'devnet' | 'mainnet-beta';

// ---------------------------------------------------------------------------
// Modal overlay
// ---------------------------------------------------------------------------

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      {/* Content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// PurchaseModal
// ---------------------------------------------------------------------------

export default function PurchaseModal({ pkg, isOpen, onClose }: PurchaseModalProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const { isAuthenticated, walletAddress } = useAuth();

  const [step, setStep] = useState<ModalStep>('details');
  const [selectedToken, setSelectedToken] = useState<TokenSymbol>(TokenSymbol.USDC);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [txSignature, setTxSignature] = useState<string | null>(null);

  // Reset state when modal opens/closes or package changes
  useEffect(() => {
    if (isOpen) {
      setStep('details');
      setSelectedToken(TokenSymbol.USDC);
      setErrorMessage('');
      setTxSignature(null);
    }
  }, [isOpen, pkg]);

  const priceUsd = pkg ? Number(pkg.priceCents) / 100 : 0;
  const perPhasePayout = pkg ? Number(pkg.accountSize) * 0.08 : 0;
  const totalPayout = pkg ? Number(pkg.accountSize) * 0.40 : 0;
  const tradeUrl = typeof window !== 'undefined' && window.location.hostname === 'setl8.com'
    ? 'https://trade.setl8.com'
    : 'http://localhost:3002';

  const handlePurchase = useCallback(async () => {
    if (!pkg || !publicKey || !signTransaction) return;

    setStep('processing');
    setErrorMessage('');

    try {
      // 0. Check if the trader already has an active challenge
      try {
        const token = localStorage.getItem('setl8_token');
        if (token) {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/trader/challenge`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.ok) {
            const body = (await res.json()) as { data?: { status?: string } };
            if (body.data?.status === 'ACTIVE') {
              setErrorMessage(
                'You already have an active challenge. Go to the trading terminal to continue.',
              );
              setStep('error');
              return;
            }
          }
        }
      } catch {
        // No active challenge or not authenticated yet — proceed
      }

      // 1. Build transaction
      const tx = await buildPurchaseTransaction({
        walletPublicKey: publicKey,
        feeAmountUsd: pkg.priceCents / 100,
        accountSizeUsd: pkg.accountSize,
        tokenSymbol: selectedToken,
        connection,
      });

      // 2. Sign with Phantom
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
          accountSizeUsd: pkg.accountSize,
          tokenSymbol: selectedToken,
        });
      } catch (backendErr) {
        console.error('Backend createAttempt failed, tx was sent:', sig, backendErr);
        // Don't fail the whole flow — the on-chain tx happened
      }

      // 5. Show success right away
      setStep('success');

      // 6. Confirm in background (non-blocking, for logging only)
      connection.confirmTransaction(sig, 'confirmed').catch(() => {
        console.warn('Confirmation polling timed out — tx may still be valid:', sig);
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Transaction failed. Please try again.';

      // Check for AttemptStillActive error from on-chain program
      if (message.includes('AttemptStillActive') || message.includes('0x1780') || message.includes('6016')) {
        setErrorMessage(
          'You already have an active challenge. Go to the trading terminal to continue.',
        );
      } else {
        setErrorMessage(message);
      }
      setStep('error');
    }
  }, [pkg, publicKey, signTransaction, selectedToken, connection]);

  const handleConnectWallet = useCallback(() => {
    onClose();
    setVisible(true);
  }, [onClose, setVisible]);

  if (!pkg) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <Overlay onClose={step === 'processing' ? () => {} : onClose}>
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <h3 className="text-white font-bold text-base">
                {step === 'success' ? 'Challenge Activated!' : 'Purchase Challenge'}
              </h3>
              {step !== 'processing' && (
                <button
                  onClick={onClose}
                  className="text-white/30 hover:text-white/60 transition-colors p-1 -m-1"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <AnimatePresence mode="wait">
                {/* ─── STEP: DETAILS ──────────────────────────────── */}
                {step === 'details' && (
                  <motion.div
                    key="details"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {/* Package info */}
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-5">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">
                            Account Size
                          </div>
                          <div className="text-white text-2xl font-bold number-font">
                            {formatUsd(Number(pkg.accountSize) || 0, 0)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">
                            Fee
                          </div>
                          <div className="text-[#7C3AED] text-xl font-bold number-font">
                            {formatUsd(Number(priceUsd) || 0, 0)}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-white/[0.04] pt-3 grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-white/40 text-[10px]">Per Phase Payout</div>
                          <div className="text-[#22C55E] text-sm font-semibold number-font">
                            {formatUsd(Number(perPhasePayout) || 0, 0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-white/40 text-[10px]">Total Potential (40%)</div>
                          <div className="text-[#22C55E] text-sm font-semibold number-font">
                            {formatUsd(Number(totalPayout) || 0, 0)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Rules summary */}
                    <div className="flex flex-wrap gap-2 mb-5">
                      {[
                        { label: '8% Target', color: 'text-[#22C55E]' },
                        { label: 'Dynamic DD', color: 'text-[#F59E0B]' },
                        { label: 'Up to 200x', color: 'text-[#7C3AED]' },
                        { label: 'No Time Limit', color: 'text-white/50' },
                        { label: '6 Phases', color: 'text-white/50' },
                      ].map(({ label, color }) => (
                        <span
                          key={label}
                          className={cn(
                            'text-[10px] font-medium px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]',
                            color,
                          )}
                        >
                          {label}
                        </span>
                      ))}
                    </div>

                    {/* Not connected — show connect button */}
                    {!isAuthenticated ? (
                      <button
                        onClick={handleConnectWallet}
                        className="w-full flex items-center justify-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold py-3 rounded-xl transition-colors"
                      >
                        <Wallet size={16} />
                        Connect Wallet to Continue
                      </button>
                    ) : (
                      <>
                        {/* Token selector */}
                        <div className="mb-4">
                          <div className="text-white/40 text-[10px] uppercase tracking-wider mb-2">
                            Pay with
                          </div>
                          <div className="flex gap-2">
                            {TOKENS.map(({ symbol, label }) => (
                              <button
                                key={symbol}
                                onClick={() => setSelectedToken(symbol)}
                                className={cn(
                                  'flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150',
                                  selectedToken === symbol
                                    ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20'
                                    : 'bg-white/[0.04] text-white/50 border border-white/[0.06] hover:border-white/[0.12]',
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Confirm button */}
                        <button
                          onClick={() => setStep('confirm')}
                          className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold py-3 rounded-xl transition-colors"
                        >
                          Continue — {formatUsd(Number(priceUsd) || 0, 0)} {selectedToken}
                        </button>
                      </>
                    )}
                  </motion.div>
                )}

                {/* ─── STEP: CONFIRM ─────────────────────────────── */}
                {step === 'confirm' && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="text-center mb-5">
                      <div className="text-white text-lg font-bold mb-1">
                        Confirm Purchase
                      </div>
                      <div className="text-white/40 text-sm">
                        Your wallet will prompt you to sign
                      </div>
                    </div>

                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-5 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-white/40 text-sm">Account Size</span>
                        <span className="text-white font-semibold number-font">
                          {formatUsd(Number(pkg.accountSize) || 0, 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40 text-sm">Fee</span>
                        <span className="text-[#7C3AED] font-semibold number-font">
                          {formatUsd(Number(priceUsd) || 0, 0)} {selectedToken}
                        </span>
                      </div>
                      <div className="border-t border-white/[0.04]" />
                      <div className="flex justify-between">
                        <span className="text-white/40 text-sm">Wallet</span>
                        <span className="text-white/60 text-sm font-mono">
                          {walletAddress ? truncateAddress(walletAddress, 6) : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40 text-sm">Split</span>
                        <span className="text-white/60 text-sm">
                          65% vault · 35% protocol
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep('details')}
                        className="flex-1 bg-white/[0.04] border border-white/[0.06] text-white/60 font-semibold py-3 rounded-xl transition-colors hover:bg-white/[0.08]"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => void handlePurchase()}
                        className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold py-3 rounded-xl transition-colors"
                      >
                        Pay {formatUsd(Number(priceUsd) || 0, 0)} {selectedToken}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ─── STEP: PROCESSING ───────────────────────────── */}
                {step === 'processing' && (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-8"
                  >
                    <Loader2 size={36} className="animate-spin text-[#7C3AED] mb-4" />
                    <div className="text-white font-semibold mb-1">Processing on-chain transaction...</div>
                    <div className="text-white/40 text-sm">Confirm in your wallet, then wait for Solana</div>
                  </motion.div>
                )}

                {/* ─── STEP: SUCCESS ──────────────────────────────── */}
                {step === 'success' && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-4"
                  >
                    {/* Animated checkmark */}
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 15,
                        delay: 0.1,
                      }}
                      className="w-16 h-16 rounded-full bg-[#22C55E]/10 border-2 border-[#22C55E] flex items-center justify-center mb-5"
                    >
                      <CheckCircle2 size={32} className="text-[#22C55E]" />
                    </motion.div>

                    <div className="text-white text-lg font-bold mb-1">
                      Your {formatUsd(Number(pkg.accountSize) || 0, 0)} challenge is ready
                    </div>
                    <div className="text-white/40 text-sm mb-4 text-center">
                      Payment confirmed on Solana. Head to the terminal to start trading.
                    </div>

                    {txSignature && (
                      <a
                        href={getSolscanTxUrl(txSignature, SOLANA_NETWORK)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary text-xs hover:underline mb-4"
                      >
                        <ExternalLink size={12} />
                        View transaction on Solscan
                      </a>
                    )}

                    <a
                      href={tradeUrl}
                      className="w-full flex items-center justify-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold py-3 rounded-xl transition-colors mb-3"
                    >
                      Start Trading
                      <ExternalLink size={14} />
                    </a>

                    <button
                      onClick={onClose}
                      className="w-full text-white/40 hover:text-white/60 text-sm py-2 transition-colors"
                    >
                      Close
                    </button>
                  </motion.div>
                )}

                {/* ─── STEP: ERROR ────────────────────────────────── */}
                {step === 'error' && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-6"
                  >
                    <div className="w-14 h-14 rounded-full bg-[#EF4444]/10 flex items-center justify-center mb-4">
                      <AlertTriangle size={28} className="text-[#EF4444]" />
                    </div>
                    <div className="text-white font-semibold mb-1">Purchase Failed</div>
                    <div className="text-[#EF4444]/80 text-sm mb-5 text-center max-w-xs">
                      {errorMessage}
                    </div>

                    <div className="flex gap-3 w-full">
                      <button
                        onClick={onClose}
                        className="flex-1 bg-white/[0.04] border border-white/[0.06] text-white/60 font-semibold py-3 rounded-xl transition-colors hover:bg-white/[0.08]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => void handlePurchase()}
                        className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold py-3 rounded-xl transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Overlay>
      )}
    </AnimatePresence>
  );
}
