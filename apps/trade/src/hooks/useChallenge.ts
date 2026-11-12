'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import { usePnlStore } from '@/store/pnl';
import { useToastStore } from '@/store/toast';
import { getChallenge } from '@/lib/api';

/**
 * Fetches the active challenge data on auth and polls every 5 seconds.
 * Populates the pnl store so AccountBar and other components stay updated.
 */
export function useChallenge(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { setPnl, reset } = usePnlStore();
  const addToast = useToastStore((s) => s.addToast);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hadActiveRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      reset();
      return;
    }

    let cancelled = false;

    async function fetchChallenge() {
      try {
        const data = await getChallenge();
        if (cancelled) return;

        if (!data) {
          setPnl({ hasActiveAttempt: false });
          return;
        }

        // Notify on first detection of active challenge
        if (!hadActiveRef.current && data.attemptId) {
          hadActiveRef.current = true;
          addToast('Challenge activated!', 'success');
        }

        setPnl({
          attemptId: data.attemptId,
          hasActiveAttempt: true,
          accountSize: data.accountSize,
          startingBalance: data.startingBalance,
          currentBalance: data.currentBalance,
          realizedPnl: data.realizedPnl,
          unrealizedPnl: data.unrealizedPnl,
          pnlPercent: data.pnlPercent,
          drawdownPercent: data.drawdownPercent,
          profitTarget: data.profitTarget,
          maxDrawdownFloor: data.maxDrawdownFloor,
          targetPrice: data.targetPrice,
          drawdownPrice: data.drawdownPrice,
          phase: data.phase,
          attemptNumber: data.attemptNumber,
          openPositions: data.openPositions,
          marginInUse: data.marginInUse,
          availableBalance: data.availableBalance,
        });
      } catch {
        // ignore — WebSocket will keep updating
      }
    }

    void fetchChallenge();
    intervalRef.current = setInterval(() => void fetchChallenge(), 5000);

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, setPnl, reset]);
}
