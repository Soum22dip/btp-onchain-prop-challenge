import { create } from 'zustand';

interface PnlState {
  attemptId: string | null;
  currentBalance: number;
  startingBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  pnlPercent: number;
  drawdownPercent: number;
  hasActiveAttempt: boolean;
}

interface PnlStore extends PnlState {
  setPnl: (data: Partial<PnlState>) => void;
  reset: () => void;
}

const defaultState: PnlState = {
  attemptId: null,
  currentBalance: 0,
  startingBalance: 0,
  realizedPnl: 0,
  unrealizedPnl: 0,
  pnlPercent: 0,
  drawdownPercent: 0,
  hasActiveAttempt: false,
};

export const usePnlStore = create<PnlStore>((set) => ({
  ...defaultState,
  setPnl: (data: Partial<PnlState>) => set((state) => ({ ...state, ...data })),
  reset: () => set(defaultState),
}));
