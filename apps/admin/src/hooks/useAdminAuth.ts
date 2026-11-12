'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuthStore } from '@/store/auth';

interface UseAdminAuthResult {
  isAuthenticated: boolean;
  secret: string | null;
  checked: boolean;
}

export function useAdminAuth(): UseAdminAuthResult {
  const router = useRouter();
  const { isAuthenticated, secret, initFromStorage } = useAdminAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    initFromStorage();
    setChecked(true);
  }, [initFromStorage]);

  useEffect(() => {
    if (checked && !isAuthenticated) {
      router.push('/login');
    }
  }, [checked, isAuthenticated, router]);

  return { isAuthenticated, secret, checked };
}
