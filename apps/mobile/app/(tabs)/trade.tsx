import React, { useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, Pressable, Alert, Modal, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PositionSide } from '@setl8/types';
import type { Position } from '@setl8/types';
import { useAuthStore } from '@/store/auth';
import { AccountHeader } from '@/components/trade/AccountHeader';
import { PositionRow } from '@/components/trade/PositionRow';
import { OrderSheet } from '@/components/trade/OrderSheet';
import { getPositions, closePosition } from '@/lib/api';
import { formatUsd } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';

export default function TradeScreen() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();
  const [orderSheetVisible, setOrderSheetVisible] = useState(false);
  const [closeSheetVisible, setCloseSheetVisible] = useState(false);
  const selectedPositionRef = useRef<Position | null>(null);

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ['positions'],
    queryFn: getPositions,
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const handlePositionPress = useCallback((position: Position) => {
    selectedPositionRef.current = position;
    setCloseSheetVisible(true);
  }, []);

  const handleClosePosition = useCallback(async () => {
    const pos = selectedPositionRef.current;
    if (!pos) return;
    try {
      await closePosition(pos.id);
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
      setCloseSheetVisible(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to close position');
    }
  }, [queryClient]);

  const renderItem = useCallback(({ item }: { item: Position }) => (
    <PositionRow position={item} onPress={() => handlePositionPress(item)} />
  ), [handlePositionPress]);

  const keyExtractor = useCallback((item: Position) => item.id, []);

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#08080F', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#888888', marginBottom: 16 }}>Connect your wallet to trade</Text>
        <Pressable
          onPress={() => router.push('/connect')}
          style={{ backgroundColor: '#7C3AED', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Connect Wallet</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#08080F' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>Trade</Text>
      </View>

      <AccountHeader />

      {/* Positions list */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </View>
      ) : (
        <FlatList
          data={positions}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Text style={{ color: '#888888', fontSize: 14, marginBottom: 8 }}>No open positions</Text>
              <Text style={{ color: '#555555', fontSize: 12, textAlign: 'center' }}>
                Tap BUY or SELL on the chart to open a trade
              </Text>
            </View>
          }
          style={{ flex: 1 }}
        />
      )}

      {/* Float button */}
      <Pressable
        onPress={() => router.push('/(tabs)/charts')}
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: '#7C3AED',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '300' }}>+</Text>
      </Pressable>

      {/* Order sheet */}
      <OrderSheet visible={orderSheetVisible} initialSide={PositionSide.Long} onClose={() => setOrderSheetVisible(false)} />

      {/* Close position modal */}
      <Modal
        visible={closeSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCloseSheetVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setCloseSheetVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        </TouchableWithoutFeedback>
        <View style={{ backgroundColor: '#111111', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, gap: 16 }}>
          {/* Handle indicator */}
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#444444', marginBottom: 4 }} />

          {selectedPositionRef.current !== null && (
            <>
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Close Position?</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#888888' }}>
                  {selectedPositionRef.current.market} {selectedPositionRef.current.side}
                </Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
                  {formatUsd(Number(selectedPositionRef.current.size ?? 0))}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#888888' }}>Current P&L</Text>
                <Text style={{
                  color: Number(selectedPositionRef.current.unrealizedPnl ?? 0) >= 0 ? '#22C55E' : '#EF4444',
                  fontWeight: '700',
                }}>
                  {formatUsd(Number(selectedPositionRef.current.unrealizedPnl ?? 0))}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                  onPress={() => setCloseSheetVisible(false)}
                  style={{ flex: 1, borderWidth: 1, borderColor: '#333333', borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: '#888888', fontWeight: '600' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => { void handleClosePosition(); }}
                  style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Close Position</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
