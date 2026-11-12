import React, { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Market } from '@setl8/types';
import { MARKET_LABELS } from '@setl8/constants';
import type { PriceFeed } from '@/store/market';
import { formatPrice } from '@/lib/utils';

interface MarketRowProps {
  market: Market;
  priceData: PriceFeed | undefined;
  onPress: () => void;
}

function MarketRowInner({ market, priceData, onPress }: MarketRowProps) {
  const price = priceData?.price ?? 0;
  const change = priceData?.changePercent ?? 0;
  const isUp = change >= 0;
  const spread = price * 0.0001;
  const bid = price - spread / 2;
  const ask = price + spread / 2;
  const decimals = price < 1 ? 6 : price < 10 ? 4 : 2;
  const changeColor = isUp ? '#22C55E' : '#EF4444';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: pressed ? '#161616' : '#08080F',
        borderBottomWidth: 1,
        borderBottomColor: '#1A1A1A',
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600', fontFamily: 'monospace' }}>
          {MARKET_LABELS[market] ?? market}
        </Text>
        <Text style={{ color: '#555555', fontSize: 10, marginTop: 1 }}>
          {price > 0 ? `Spread: ${spread.toFixed(decimals)}` : '\u2014'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={{ color: '#B71C1C', fontSize: 13, fontFamily: 'monospace', fontWeight: '700' }}>
            {price > 0 ? formatPrice(bid, decimals) : '\u2014'}
          </Text>
          <Text style={{ color: '#1565C0', fontSize: 13, fontFamily: 'monospace', fontWeight: '700' }}>
            {price > 0 ? formatPrice(ask, decimals) : '\u2014'}
          </Text>
        </View>
        <Text style={{ color: changeColor, fontSize: 10, marginTop: 1 }}>
          {isUp ? '+' : ''}{change.toFixed(2)}%
        </Text>
      </View>
    </Pressable>
  );
}

export const MarketRow = memo(MarketRowInner);
