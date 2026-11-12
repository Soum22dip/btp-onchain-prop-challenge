'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuthStore } from '@/store/auth';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const router = useRouter();
  const { isAuthenticated, initFromStorage } = useAdminAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    initFromStorage();
    setChecked(true);
  }, [initFromStorage]);

  useEffect(() => {
    if (!checked) return;
    if (isAuthenticated) {
      router.replace('/overview');
    } else {
      router.replace('/login');
    }
  }, [checked, isAuthenticated, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Loader2 className="animate-spin text-text-secondary" size={32} />
    </div>
  );
}
