'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { usePnlStore } from '@/store/pnl';
import { getSocket, disconnectSocket } from '@/lib/socket';

export function useSocket(): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const token = useAuthStore((s) => s.token);
  const { setPnl } = usePnlStore();

  useEffect(() => {
    if (!token) return;

    const socket = getSocket(token);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('pnl:update', (data) => {
      setPnl({ ...(data as Record<string, unknown>), hasActiveAttempt: true });
    });
    socket.on('attempt:failed', () => setPnl({ hasActiveAttempt: false }));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('pnl:update');
      socket.off('attempt:failed');
      disconnectSocket();
    };
  }, [token, setPnl]);

  return { connected };
}
