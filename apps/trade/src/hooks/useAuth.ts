'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import { useAuthStore } from '@/store/auth';
import { useToastStore } from '@/store/toast';
import { getNonce, verifyWallet, logout, getProfile, ApiError } from '@/lib/api';
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
  authFailed: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const { publicKey, signMessage, connected, connecting, disconnect } = useWallet();
  const addToast = useToastStore((s) => s.addToast);
  const {
    token,
    trader,
    isAuthenticated,
    setAuth,
    clearAuth,
    initFromStorage,
    updateTrader,
  } = useAuthStore();

  const [authFailed, setAuthFailed] = useState(false);

  // Initialize token from localStorage on mount
  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  // Verify stored token is still valid — clear if expired
  const verifiedRef = useRef(false);
  useEffect(() => {
    if (token && isAuthenticated && !trader && !verifiedRef.current) {
      verifiedRef.current = true;
      getProfile()
        .then((profile) => updateTrader(profile))
        .catch(() => {
          // Token is expired/invalid — clear it silently so auto-sign can fire
          clearAuth();
        })
        .finally(() => { verifiedRef.current = false; });
    }
  }, [token, trader, isAuthenticated, updateTrader, clearAuth]);

  const signInInternal = useCallback(async () => {
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

  // Auto sign-in when wallet connects and not already authenticated
  const signingIn = useRef(false);
  useEffect(() => {
    // Guard: all prerequisites must be ready before auto-sign fires
    if (!connected || !publicKey || !signMessage) return;
    if (isAuthenticated || token) return;
    if (signingIn.current) return;

    signingIn.current = true;
    setAuthFailed(false);
    signInInternal()
      .then(() => {
        addToast('Wallet connected', 'success');
        setAuthFailed(false);
      })
      .catch((err) => {
        setAuthFailed(true);
        if (err instanceof ApiError && err.status === 429) {
          addToast('Rate limited — try again in a moment', 'error');
        } else if (err instanceof Error && err.message.includes('User rejected')) {
          // User closed Phantom popup — don't nag
        } else {
          addToast('Sign-in failed — click Sign In to retry', 'error');
        }
      })
      .finally(() => { signingIn.current = false; });
  }, [connected, publicKey, signMessage, isAuthenticated, token, signInInternal, addToast]);

  // Reset authFailed when wallet disconnects
  useEffect(() => {
    if (!connected) setAuthFailed(false);
  }, [connected]);

  const signIn = useCallback(async () => {
    try {
      setAuthFailed(false);
      await signInInternal();
      addToast('Wallet connected', 'success');
    } catch (err) {
      setAuthFailed(true);
      if (err instanceof ApiError && err.status === 429) {
        addToast('Rate limited — try again in a moment', 'error');
      } else {
        addToast('Sign-in failed', 'error');
      }
      throw err;
    }
  }, [signInInternal, addToast]);

  const signOut = useCallback(() => {
    logout();
    clearAuth();
    setAuthFailed(false);
    disconnect().catch(() => {});
  }, [clearAuth, disconnect]);

  const refreshProfile = useCallback(async () => {
    if (!isAuthenticated) return;
    const profile = await getProfile();
    updateTrader(profile);
  }, [isAuthenticated, updateTrader]);

  return {
    isAuthenticated,
    trader,
    walletConnected: connected,
    walletAddress: publicKey?.toBase58() ?? null,
    isConnecting: connecting,
    authFailed,
    signIn,
    signOut,
    refreshProfile,
  };
}
