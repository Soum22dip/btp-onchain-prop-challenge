import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface PnlStore {
  attemptId: string | null;
  realizedPnl: number;
  unrealizedPnl: number;
  currentBalance: number;
  startingBalance: number;
  pnlPercent: number;
  drawdownPercent: number;
  hasActiveAttempt: boolean;
  // Challenge-specific fields
  accountSize: number;
  profitTarget: number;
  maxDrawdownFloor: number;
  targetPrice: number;
  drawdownPrice: number;
  phase: string;
  attemptNumber: number;
  openPositions: number;
  marginInUse: number;
  availableBalance: number;
  setPnl: (data: Partial<PnlStore>) => void;
  reset: () => void;
}

const defaultState = {
  attemptId: null,
  realizedPnl: 0,
  unrealizedPnl: 0,
  currentBalance: 0,
  startingBalance: 0,
  pnlPercent: 0,
  drawdownPercent: 0,
  hasActiveAttempt: false,
  accountSize: 0,
  profitTarget: 0,
  maxDrawdownFloor: 0,
  targetPrice: 0,
  drawdownPrice: 0,
  phase: '',
  attemptNumber: 0,
  openPositions: 0,
  marginInUse: 0,
  availableBalance: 0,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePnlStore = create<PnlStore>((set) => ({
  ...defaultState,

  setPnl: (data: Partial<PnlStore>) => set((state) => ({ ...state, ...data })),

  reset: () => set(defaultState),
}));
