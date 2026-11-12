import { useAuthStore } from '@/store/auth';

export function useAuth() {
  const { token, trader, isAuthenticated, isLoading, clearAuth } = useAuthStore();

  const logout = () => {
    clearAuth();
  };

  return { token, trader, isAuthenticated, isLoading, logout };
}
