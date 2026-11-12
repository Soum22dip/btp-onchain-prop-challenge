'use client';

import React from 'react';
import { useMarketStore, TIMEFRAMES, type TimeframeOption } from '@/store/market';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// TimeframeSelector — horizontal pill buttons for chart interval
// ---------------------------------------------------------------------------

export const TimeframeSelector = React.memo(function TimeframeSelector() {
  const selectedTimeframe = useMarketStore((s) => s.selectedTimeframe);
  const setSelectedTimeframe = useMarketStore((s) => s.setSelectedTimeframe);

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 shrink-0">
      {TIMEFRAMES.map((tf: TimeframeOption) => {
        const isActive = tf.interval === selectedTimeframe.interval;
        return (
          <button
            key={tf.interval}
            onClick={() => setSelectedTimeframe(tf)}
            className={cn(
              'px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all duration-200',
              isActive
                ? 'bg-[#7C3AED] text-white shadow-sm shadow-purple-500/20'
                : 'text-white/35 hover:text-white/60 hover:bg-white/[0.04]',
            )}
          >
            {tf.label}
          </button>
        );
      })}
    </div>
  );
});
