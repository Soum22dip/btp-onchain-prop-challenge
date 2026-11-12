import React from 'react';
import { View, Text } from 'react-native';
import { usePnlStore } from '@/store/pnl';
import { PROFIT_TARGET_PERCENT, MAX_DRAWDOWN_PERCENT } from '@setl8/constants';
import { formatUsd } from '@/lib/utils';

export function AccountHeader() {
  const { currentBalance, startingBalance, pnlPercent, drawdownPercent } = usePnlStore();

  const equity = currentBalance > 0 ? currentBalance : startingBalance;
  const freeMargin = equity;
  const targetLimit = Number(PROFIT_TARGET_PERCENT) * 100;
  const drawdownLimit = Number(MAX_DRAWDOWN_PERCENT) * 100;
  const targetPct = targetLimit > 0 ? Math.min((pnlPercent / targetLimit) * 100, 100) : 0;
  const drawdownPct = drawdownLimit > 0 ? Math.min((drawdownPercent / drawdownLimit) * 100, 100) : 0;

  const balanceValue = formatUsd(currentBalance > 0 ? currentBalance : startingBalance);
  const equityValue = formatUsd(equity);
  const freeMarginValue = formatUsd(freeMargin);

  return (
    <View style={{ backgroundColor: '#111111', padding: 16, borderBottomWidth: 1, borderBottomColor: '#222222' }}>
      {/* Balance rows */}
      <View style={{ gap: 4 }}>
        {([
          { label: 'Balance',     value: balanceValue },
          { label: 'Equity',      value: equityValue },
          { label: 'Free margin', value: freeMarginValue },
        ] as const).map(({ label, value }) => (
          <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#888888', fontSize: 12 }}>{label}:</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'monospace' }}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {/* Progress bars */}
      <View style={{ marginTop: 12, gap: 8 }}>
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
            <Text style={{ color: '#888888', fontSize: 10 }}>Profit Target</Text>
            <Text style={{ color: '#22C55E', fontSize: 10 }}>
              {pnlPercent.toFixed(1)}% / {targetLimit.toFixed(0)}%
            </Text>
          </View>
          <View style={{ height: 4, backgroundColor: '#222222', borderRadius: 2 }}>
            <View style={{
              height: 4,
              backgroundColor: '#22C55E',
              borderRadius: 2,
              width: `${Math.max(0, Math.min(targetPct, 100))}%`,
            }} />
          </View>
        </View>
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
            <Text style={{ color: '#888888', fontSize: 10 }}>Max Drawdown</Text>
            <Text style={{ color: drawdownPercent > 6 ? '#EF4444' : '#F59E0B', fontSize: 10 }}>
              {drawdownPercent.toFixed(1)}% / {drawdownLimit.toFixed(0)}%
            </Text>
          </View>
          <View style={{ height: 4, backgroundColor: '#222222', borderRadius: 2 }}>
            <View style={{
              height: 4,
              backgroundColor: drawdownPercent > 6 ? '#EF4444' : '#F59E0B',
              borderRadius: 2,
              width: `${Math.max(0, Math.min(drawdownPct, 100))}%`,
            }} />
          </View>
        </View>
      </View>
    </View>
  );
}
