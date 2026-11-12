'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Star } from 'lucide-react';
import { cn, formatUsd } from '@/lib/utils';
import { EVALUATION_PACKAGES } from '@setl8/constants';
import type { EvaluationPackage } from '@setl8/types';

// ---------------------------------------------------------------------------
// PackageSelector
// ---------------------------------------------------------------------------

interface PackageSelectorProps {
  selected: EvaluationPackage | null;
  onSelect: (pkg: EvaluationPackage) => void;
}

const BADGE_CONFIG: Record<number, { label: string; className: string; borderClass: string }> = {
  5_000:    { label: 'Most Purchased', className: 'bg-green-500/20 text-green-400 border border-green-500/30', borderClass: '' },
  50_000:   { label: 'Recommended',    className: 'bg-primary/20 text-primary border border-primary/30',       borderClass: 'border-primary/30 shadow-purple-glow-sm' },
  200_000:  { label: 'Expert Pick',    className: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30', borderClass: '' },
};

export default function PackageSelector({ selected, onSelect }: PackageSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {EVALUATION_PACKAGES.map((pkg, i) => {
        const isSelected = selected?.accountSize === pkg.accountSize;
        const badge = BADGE_CONFIG[pkg.accountSize] ?? null;
        const priceUsd = pkg.priceCents / 100;

        return (
          <motion.button
            key={pkg.accountSize}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            onClick={() => onSelect(pkg)}
            className={cn(
              'relative text-left p-5 rounded-xl border transition-all duration-200 cursor-pointer',
              isSelected
                ? 'border-primary bg-primary/5 shadow-purple-glow-sm'
                : 'border-border-setl8 bg-surface hover:border-primary/40 hover:bg-surface-2',
              !isSelected && badge?.borderClass,
            )}
          >
            {/* Badge */}
            {badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <div className={cn('flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap', badge.className)}>
                  <Star className="w-3 h-3 fill-current" />
                  {badge.label}
                </div>
              </div>
            )}

            {/* Selected check */}
            {isSelected && (
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}

            {/* Account size */}
            <div className="mb-3 mt-2">
              <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-1">
                Account Size
              </div>
              <div className="text-2xl font-bold text-white number-font">
                {formatUsd(pkg.accountSize, 0)}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border-setl8 my-3" />

            {/* Price */}
            <div>
              <div className="text-text-secondary text-xs mb-1">One-time fee</div>
              <div className={cn('text-xl font-bold number-font', isSelected ? 'text-primary' : 'text-white')}>
                {formatUsd(priceUsd, 0)}
              </div>
            </div>

            {/* Features */}
            <div className="mt-4 space-y-1.5">
              {[
                '8% profit target',
                'Dynamic drawdown',
                '6 total phases',
                'Payout from phase 2',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Check className="w-3 h-3 text-success shrink-0" />
                  {feature}
                </div>
              ))}
            </div>

            {/* Select button */}
            <div className={cn(
              'w-full mt-4 py-3 rounded-xl text-center text-sm font-medium transition-all',
              isSelected
                ? 'bg-primary text-white'
                : 'bg-[#7C3AED]/10 text-[#7C3AED] hover:bg-[#7C3AED] hover:text-white',
            )}>
              Select &mdash; {formatUsd(priceUsd, 0)}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
