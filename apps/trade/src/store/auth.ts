import { create } from 'zustand';
import type { TraderProfile } from '@setl8/types';

// ---------------------------------------------------------------------------
// Store interface
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

const TOKEN_KEY = 'setl8_token';

function safeGetLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeRemoveLocalStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  trader: null,
  isAuthenticated: false,

  setAuth: (token: string, trader: TraderProfile) => {
    safeSetLocalStorage(TOKEN_KEY, token);
    set({ token, trader, isAuthenticated: true });
  },

  updateTrader: (trader: TraderProfile) => set({ trader }),

  clearAuth: () => {
    safeRemoveLocalStorage(TOKEN_KEY);
    set({ token: null, trader: null, isAuthenticated: false });
  },

  initFromStorage: () => {
    const token = safeGetLocalStorage(TOKEN_KEY);
    if (token) {
      set({ token, isAuthenticated: true });
    }
  },
}));
