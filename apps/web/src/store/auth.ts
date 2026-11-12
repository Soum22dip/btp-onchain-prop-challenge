'use client';

import { create } from 'zustand';
import type { TraderProfile } from '@setl8/types';
import { getToken, clearToken } from '@/lib/api';

// ---------------------------------------------------------------------------
// Auth Store
// ---------------------------------------------------------------------------

interface AuthStore {
  token: string | null;
  trader: TraderProfile | null;
  isAuthenticated: boolean;
  setAuth: (token: string, trader: TraderProfile) => void;
  updateTrader: (trader: TraderProfile) => void;
  clearAuth: () => void;
  initFromStorage: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  trader: null,
  isAuthenticated: false,

  setAuth: (token: string, trader: TraderProfile) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('setl8_token', token);
    }
    set({ token, trader, isAuthenticated: true });
  },

  updateTrader: (trader: TraderProfile) => {
    set({ trader });
  },

  clearAuth: () => {
    clearToken();
    set({ token: null, trader: null, isAuthenticated: false });
  },

  initFromStorage: () => {
    const token = getToken();
    if (token) {
      set({ token, isAuthenticated: true });
    }
  },
}));
