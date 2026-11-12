import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Modal, TouchableWithoutFeedback } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { PositionSide } from '@setl8/types';
import type { Market } from '@setl8/types';
import { LEVERAGE, MARKET_DISPLAY_NAME } from '@setl8/constants';
import { useMarketStore } from '@/store/market';
import { usePnlStore } from '@/store/pnl';
import { openPosition } from '@/lib/api';
import { formatUsd, formatPrice } from '@/lib/utils';

interface OrderSheetProps {
  visible: boolean;
  initialSide?: PositionSide;
  onClose: () => void;
}

export function OrderSheet({ visible, initialSide = PositionSide.Long, onClose }: OrderSheetProps) {
  const queryClient = useQueryClient();
  const selectedMarket = useMarketStore((s) => s.selectedMarket);
  const priceData = useMarketStore((s) => s.prices[selectedMarket as Market]);
  const entryPrice = priceData?.price ?? 0;
  const { currentBalance, startingBalance } = usePnlStore();

  const [side, setSide] = useState<PositionSide>(initialSide);
  const [sizeUsd, setSizeUsd] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lev = Number(LEVERAGE) || 100;
  const effectiveBalance = currentBalance > 0 ? currentBalance : startingBalance > 0 ? startingBalance : 10000;
  const maxSize = Math.max(effectiveBalance * lev, 1000);
  const margin = sizeUsd / lev;
  const liqPrice = entryPrice > 0
    ? side === PositionSide.Long
      ? entryPrice * (1 - (1 / lev) * 0.9)
      : entryPrice * (1 + (1 / lev) * 0.9)
    : 0;

  const handleSubmit = useCallback(async () => {
    if (isLoading || sizeUsd < 10) return;
    setError(null);
    setIsLoading(true);
    try {
      await openPosition({ market: selectedMarket as string, side, sizeUsd });
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open position');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, sizeUsd, selectedMarket, side, queryClient, onClose]);

  const isLong = side === PositionSide.Long;
  const decimals = entryPrice < 1 ? 6 : 2;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      </TouchableWithoutFeedback>
      <View style={{ backgroundColor: '#111111', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 12 }}>
        {/* Handle indicator */}
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#444444', marginBottom: 4 }} />

        {/* Market title */}
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
          {MARKET_DISPLAY_NAME[selectedMarket]}
        </Text>

        {/* Leverage badge */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: 'rgba(124,58,237,0.1)',
          borderWidth: 1,
          borderColor: 'rgba(124,58,237,0.2)',
          borderRadius: 8,
          paddingVertical: 6,
        }}>
          <Text style={{ color: '#7C3AED', fontSize: 12, fontWeight: '700' }}>100x</Text>
          <Text style={{ color: '#555555' }}>{'\u00b7'}</Text>
          <Text style={{ color: '#888888', fontSize: 12 }}>Cross Margin</Text>
        </View>

        {/* Side selector */}
        <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#222222' }}>
          <Pressable
            onPress={() => setSide(PositionSide.Long)}
            style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: isLong ? '#1565C0' : '#111111' }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>BUY</Text>
          </Pressable>
          <Pressable
            onPress={() => setSide(PositionSide.Short)}
            style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: !isLong ? '#B71C1C' : '#111111' }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>SELL</Text>
          </Pressable>
        </View>

        {/* Size input */}
        <View>
          <Text style={{ color: '#555555', fontSize: 10, marginBottom: 6 }}>POSITION SIZE</Text>
          <TextInput
            value={sizeUsd.toString()}
            onChangeText={(t) => {
              const n = parseFloat(t);
              if (!isNaN(n)) setSizeUsd(Math.max(10, Math.min(maxSize, n)));
            }}
            keyboardType="numeric"
            style={{
              backgroundColor: '#08080F',
              borderWidth: 1,
              borderColor: '#222222',
              borderRadius: 8,
              padding: 12,
              color: '#FFFFFF',
              fontSize: 16,
              fontFamily: 'monospace',
            }}
          />
        </View>

        {/* Details */}
        {entryPrice > 0 && (
          <View style={{
            backgroundColor: '#08080F',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#222222',
            padding: 10,
            gap: 6,
          }}>
            {([
              { label: 'Margin required', value: formatUsd(margin),                                         color: '#FFFFFF' },
              { label: 'Entry price',     value: formatPrice(entryPrice, decimals),                        color: '#FFFFFF' },
              { label: 'Est. liq. price', value: formatPrice(liqPrice, liqPrice < 1 ? 6 : 2),              color: '#EF4444' },
            ] as const).map(({ label, value, color }) => (
              <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#555555', fontSize: 12 }}>{label}</Text>
                <Text style={{ color, fontSize: 12, fontFamily: 'monospace' }}>{value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Error */}
        {error !== null && (
          <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 10 }}>
            <Text style={{ color: '#EF4444', fontSize: 12 }}>{error}</Text>
          </View>
        )}

        {/* Submit */}
        <Pressable
          onPress={() => { void handleSubmit(); }}
          disabled={isLoading || sizeUsd < 10}
          style={{
            backgroundColor: isLong ? '#1565C0' : '#B71C1C',
            borderRadius: 8,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: isLoading || sizeUsd < 10 ? 0.5 : 1,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {isLoading && <ActivityIndicator size="small" color="#FFFFFF" />}
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
            Open {isLong ? 'Long' : 'Short'}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
