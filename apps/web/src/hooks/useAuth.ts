'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import bs58 from 'bs58';
import { useAuthStore } from '@/store/auth';
import { getNonce, verifyWallet, logout, getProfile } from '@/lib/api';
import type { TraderProfile } from '@setl8/types';

// ---------------------------------------------------------------------------
// useAuth hook
// ---------------------------------------------------------------------------

interface UseAuthReturn {
  isAuthenticated: boolean;
  trader: TraderProfile | null;
  walletConnected: boolean;
  walletAddress: string | null;
  isConnecting: boolean;
  connectWallet: () => void;
  signIn: () => Promise<void>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const { publicKey, signMessage, connected, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const { token, trader, isAuthenticated, setAuth, clearAuth, initFromStorage, updateTrader } = useAuthStore();

  // Initialize token from localStorage on mount
  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  // Fetch trader profile once we have a token but no trader data
  useEffect(() => {
    if (token && !trader && isAuthenticated) {
      getProfile()
        .then((profile) => updateTrader(profile))
        .catch(() => {
          // Token may be expired — clear auth
          clearAuth();
        });
    }
  }, [token, trader, isAuthenticated, updateTrader, clearAuth]);

  const connectWallet = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      throw new Error('Wallet not connected');
    }

    const walletAddress = publicKey.toBase58();

    // 1. Get nonce/challenge from backend
    const challenge = await getNonce(walletAddress);

    // 2. Sign the message
    const messageBytes = new TextEncoder().encode(challenge.message);
    const signatureBytes = await signMessage(messageBytes);
    const signature = bs58.encode(signatureBytes);

    // 3. Verify and get JWT
    const result = await verifyWallet(walletAddress, signature, challenge.message);
    setAuth(result.token, result.trader);
  }, [publicKey, signMessage, setAuth]);

  const signOut = useCallback(() => {
    logout();
    clearAuth();
  }, [clearAuth]);

  const refreshProfile = useCallback(async () => {
    if (!isAuthenticated) return;
    const profile = await getProfile();
    updateTrader(profile);
  }, [isAuthenticated, updateTrader]);

  // Auto-sign when wallet connects but user is not yet authenticated
  const signingRef = useRef(false);
  useEffect(() => {
    if (connected && publicKey && !isAuthenticated && !token && !signingRef.current) {
      signingRef.current = true;
      signIn()
        .catch(() => {
          // silently fail — user can manually retry
        })
        .finally(() => { signingRef.current = false; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey, isAuthenticated, token]);

  return {
    isAuthenticated,
    trader,
    walletConnected: connected,
    walletAddress: publicKey?.toBase58() ?? null,
    isConnecting: connecting,
    connectWallet,
    signIn,
    signOut,
    refreshProfile,
  };
}
