import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Position } from '@setl8/types';
import { PositionSide } from '@setl8/types';
import { MARKET_LABELS } from '@setl8/constants';
import { formatUsd, formatDateTime } from '@/lib/utils';

interface PositionRowProps {
  position: Position;
  onPress: () => void;
}

export function PositionRow({ position, onPress }: PositionRowProps) {
  const pnl = Number(position.unrealizedPnl ?? 0);
  const isProfit = pnl >= 0;
  const size = Number(position.size ?? 0);
  const entry = Number(position.entryPrice ?? 0);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1A1A1A',
        backgroundColor: pressed ? '#161616' : '#111111',
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
            {MARKET_LABELS[position.market] ?? position.market}, {position.side === PositionSide.Long ? 'buy' : 'sell'}
          </Text>
          <Text style={{ color: '#555555', fontSize: 11, marginTop: 2 }}>
            {formatDateTime(position.openedAt)}
          </Text>
        </View>
        <Text style={{
          color: isProfit ? '#22C55E' : '#EF4444',
          fontSize: 14,
          fontWeight: '700',
          fontFamily: 'monospace',
        }}>
          {isProfit ? '+' : ''}{formatUsd(pnl)}
        </Text>
      </View>
      <Text style={{ color: '#888888', fontSize: 11, marginTop: 4 }}>
        {formatUsd(size)} at market {'\u00b7'} Entry: {entry.toFixed(2)}
      </Text>
    </Pressable>
  );
}
