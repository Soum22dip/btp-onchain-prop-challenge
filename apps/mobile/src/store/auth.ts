import { create } from 'zustand';
import type { TraderProfile } from '@setl8/types';
import { getToken, clearToken } from '@/lib/storage';
import { getProfile } from '@/lib/api';

interface AuthStore {
  token: string | null;
  trader: TraderProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (token: string, trader: TraderProfile) => void;
  clearAuth: () => void;
  initFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  trader: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (token: string, trader: TraderProfile) => {
    set({ token, trader, isAuthenticated: true, isLoading: false });
  },

  clearAuth: () => {
    void clearToken();
    set({ token: null, trader: null, isAuthenticated: false, isLoading: false });
  },

  initFromStorage: async () => {
    set({ isLoading: true });
    try {
      const token = await getToken();
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const trader = await getProfile();
      set({ token, trader, isAuthenticated: true, isLoading: false });
    } catch {
      await clearToken();
      set({ token: null, trader: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
