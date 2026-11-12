import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PositionSide } from '@setl8/types';
import { MARKET_DISPLAY_NAME, MARKET_LABELS } from '@setl8/constants';
import { useMarketStore } from '@/store/market';
import { TradingChart } from '@/components/charts/TradingChart';
import { OrderSheet } from '@/components/trade/OrderSheet';
import { formatPrice } from '@/lib/utils';

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

export default function ChartsScreen() {
  const [timeframe, setTimeframe] = useState('H1');
  const [sheetSide, setSheetSide] = useState<PositionSide>(PositionSide.Long);
  const [sheetVisible, setSheetVisible] = useState(false);
  const selectedMarket = useMarketStore((s) => s.selectedMarket);
  const priceData = useMarketStore((s) => s.prices[selectedMarket]);
  const price = priceData?.price ?? 0;
  const spread = price * 0.0001;
  const bid = price - spread / 2;
  const ask = price + spread / 2;
  const decimals = price < 1 ? 6 : 2;

  const openSheet = useCallback((side: PositionSide) => {
    setSheetSide(side);
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#08080F' }}>
      {/* SELL/BUY header */}
      <View style={{ flexDirection: 'row', height: 56 }}>
        <Pressable
          onPress={() => openSheet(PositionSide.Short)}
          style={{ flex: 1, backgroundColor: '#B71C1C', alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 12 }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>SELL</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800', fontFamily: 'monospace' }}>
            {price > 0 ? formatPrice(bid, decimals) : '\u2014'}
          </Text>
        </Pressable>
        <View style={{ width: 80, backgroundColor: '#08080F', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#555555', fontSize: 9 }}>spread</Text>
          <Text style={{ color: '#888888', fontSize: 11, fontFamily: 'monospace' }}>
            {price > 0 ? spread.toFixed(decimals) : '\u2014'}
          </Text>
        </View>
        <Pressable
          onPress={() => openSheet(PositionSide.Long)}
          style={{ flex: 1, backgroundColor: '#1565C0', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 12 }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>BUY</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800', fontFamily: 'monospace' }}>
            {price > 0 ? formatPrice(ask, decimals) : '\u2014'}
          </Text>
        </Pressable>
      </View>

      {/* Timeframe bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: '#111111', flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6, gap: 4, flexDirection: 'row' }}
      >
        {TIMEFRAMES.map((tf) => (
          <Pressable
            key={tf}
            onPress={() => setTimeframe(tf)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 4,
              backgroundColor: tf === timeframe ? '#7C3AED' : 'transparent',
            }}
          >
            <Text style={{
              color: tf === timeframe ? '#FFFFFF' : '#888888',
              fontSize: 11,
              fontWeight: tf === timeframe ? '700' : '400',
            }}>
              {tf}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Market label overlay + chart */}
      <View style={{ flex: 1 }}>
        <TradingChart market={selectedMarket} timeframe={timeframe} />
        <View style={{ position: 'absolute', top: 8, left: 12 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
            {MARKET_LABELS[selectedMarket] ?? selectedMarket}
          </Text>
          <Text style={{ color: '#555555', fontSize: 10 }}>
            {MARKET_DISPLAY_NAME[selectedMarket]}
          </Text>
        </View>
      </View>

      {/* Order sheet */}
      <OrderSheet visible={sheetVisible} initialSide={sheetSide} onClose={closeSheet} />
    </SafeAreaView>
  );
}
