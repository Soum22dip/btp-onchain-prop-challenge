'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'How does the automatic payout work?',
    answer:
      "Every 5 days, Setl8's smart contract fires a payout batch. Any trader who hit 8% profit and submitted a payout request gets paid automatically. The contract reads the payout queue onchain, transfers funds from the vault to each trader's wallet, and records every transaction publicly. No human reviews, no approvals, no delays.",
  },
  {
    question: 'What happens if I breach the drawdown?',
    answer:
      'Your drawdown is dynamic. It starts at 8% static from your starting balance. After winning trades, it tightens to 4% trailing from your peak to protect profits. After a loss exceeding 1% of your starting balance, it resets to the generous 8% static. If your balance hits the floor, the phase ends instantly. You still have remaining phases (6 total) — buy a new challenge to continue.',
  },
  {
    question: 'Can I trade any market?',
    answer:
      'You can trade 80+ synthetic markets across crypto (BTC, ETH, SOL, and 60+ altcoins), forex (EUR/USD, GBP/USD, etc.), metals (gold, silver), and indices (SPY, QQQ, etc.). All markets use real-time prices from Bybit and Finnhub. Leverage: up to 50x on crypto, 200x on forex, 100x on metals and indices.',
  },
  {
    question: 'How many phases are there?',
    answer:
      'Each challenge has 6 phases. Phase 1 is evaluation only — hit 8% profit to prove your edge. Phases 2-6 are funded, meaning you can request payouts when you pass. Each phase is independent: hit 8% profit before the drawdown floor to pass.',
  },
  {
    question: 'What tokens can I pay with?',
    answer:
      'You can pay the challenge fee in USDC, USDT, or USD1 on Solana. All three are accepted at face value. The payment is split automatically by the smart contract: 65% goes to the payout vault (to pay traders) and 35% goes to the protocol wallet.',
  },
  {
    question: 'Is there a daily drawdown limit?',
    answer:
      "No — and this is one of Setl8's biggest advantages over traditional prop firms. There is no daily stopout. Your only limit is the dynamic drawdown (8% static or 4% trailing). This gives you the freedom to trade aggressively on volatile days without worrying about an arbitrary daily limit cutting you off.",
  },
  {
    question: 'How much can I get paid?',
    answer:
      'Payouts start at phase 2. You get 100% of your profits for all 5 funded phases — no split with the firm. The minimum payout per withdrawal is 8% of your account size, and you can withdraw up to 40% cumulative across phases 2-6. For a $10,000 account, that means up to $4,000 in total payouts.',
  },
  {
    question: 'What is Dynamic Drawdown?',
    answer:
      'Your drawdown starts at 8% from your starting balance (static). After winning trades, it tightens to 4% trailing from your peak balance to protect your profits. After a losing trade of more than 1% of your starting balance, it resets to the generous 8% static. This protects your gains while giving you room to recover from losses.',
  },
  {
    question: 'What are the trading fees?',
    answer:
      '0.035% per trade (open and close), calculated on the larger of your account size or position notional. No funding fees, no hidden charges. That is 30% cheaper than Binance.',
  },
];

function FAQAccordionItem({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-white/[0.04]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span
          className={cn(
            'text-base font-medium transition-colors pr-4',
            isOpen ? 'text-white' : 'text-text-secondary group-hover:text-white',
          )}
        >
          {item.question}
        </span>
        <ChevronDown
          size={18}
          className={cn(
            'text-text-muted shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180 text-primary',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="text-text-secondary text-sm leading-relaxed pb-5">
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="max-w-2xl mx-auto">
      {FAQ_ITEMS.map((item, i) => (
        <FAQAccordionItem
          key={i}
          item={item}
          isOpen={openIndex === i}
          onToggle={() => setOpenIndex(openIndex === i ? null : i)}
        />
      ))}
    </div>
  );
}
