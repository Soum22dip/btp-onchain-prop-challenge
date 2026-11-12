import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth';
import { useMarketStore } from '@/store/market';
import { usePnlStore } from '@/store/pnl';
import { getSocket, disconnectSocket } from '@/lib/socket';
import type { Market } from '@setl8/types';

interface PriceUpdatePayload {
  market: string;
  price: number;
  change?: number;
  changePercent?: number;
}

interface PnlUpdatePayload {
  attemptId: string;
  realizedPnl: number;
  unrealizedPnl: number;
  currentBalance: number;
  startingBalance: number;
  pnlPercent: number;
  drawdownPercent: number;
}

export function useSocket(): Socket | null {
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const updatePrices = useMarketStore((s) => s.updatePrices);
  const updatePrice = useMarketStore((s) => s.updatePrice);
  const setPnl = usePnlStore((s) => s.setPnl);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      disconnectSocket();
      socketRef.current = null;
      return;
    }

    const socket = getSocket(token);
    socketRef.current = socket;

    socket.on('prices:snapshot', (data: Record<string, number>) => {
      updatePrices(data);
    });

    socket.on('price:update', (payload: PriceUpdatePayload) => {
      updatePrice(payload.market as Market, {
        price: payload.price,
        change: payload.change ?? 0,
        changePercent: payload.changePercent ?? 0,
      });
    });

    socket.on('pnl:update', (payload: PnlUpdatePayload) => {
      setPnl({
        attemptId: payload.attemptId,
        realizedPnl: payload.realizedPnl,
        unrealizedPnl: payload.unrealizedPnl,
        currentBalance: payload.currentBalance,
        startingBalance: payload.startingBalance,
        pnlPercent: payload.pnlPercent,
        drawdownPercent: payload.drawdownPercent,
        hasActiveAttempt: true,
      });
    });

    return () => {
      socket.off('prices:snapshot');
      socket.off('price:update');
      socket.off('pnl:update');
    };
  }, [isAuthenticated, token, updatePrices, updatePrice, setPnl]);

  return socketRef.current;
}
