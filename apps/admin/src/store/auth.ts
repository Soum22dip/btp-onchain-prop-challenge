import { create } from 'zustand';
import { setAdminSecret as persistSecret, clearAdminSecret as removeSecret } from '@/lib/api';

interface AdminAuthStore {
  secret: string | null;
  isAuthenticated: boolean;
  setSecret: (secret: string) => void;
  clearSecret: () => void;
  initFromStorage: () => void;
}

const STORAGE_KEY = 'setl8_admin_secret';

export const useAdminAuthStore = create<AdminAuthStore>((set) => ({
  secret: null,
  isAuthenticated: false,

  setSecret: (secret: string) => {
    persistSecret(secret);
    set({ secret, isAuthenticated: true });
  },

  clearSecret: () => {
    removeSecret();
    set({ secret: null, isAuthenticated: false });
  },

  initFromStorage: () => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      set({ secret: stored, isAuthenticated: true });
    } else {
      set({ secret: null, isAuthenticated: false });
    }
  },
}));
