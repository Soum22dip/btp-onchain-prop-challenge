import React, { useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { Position, PayoutRequest } from '@setl8/types';
import { PositionStatus, PositionSide } from '@setl8/types';
import { useAuthStore } from '@/store/auth';
import { getPositions, getPayouts } from '@/lib/api';
import { DealRow } from '@/components/history/DealRow';
import { MARKET_LABELS } from '@setl8/constants';
import { formatUsd, formatDateTime } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';

type HistoryTab = 'POSITIONS' | 'ORDERS' | 'DEALS';

export default function HistoryScreen() {
  const [activeTab, setActiveTab] = useState<HistoryTab>('POSITIONS');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: positions = [], isLoading: posLoading } = useQuery({
    queryKey: ['all-positions'],
    queryFn: getPositions,
    enabled: isAuthenticated,
  });

  const { data: payouts = [], isLoading: payLoading } = useQuery({
    queryKey: ['payouts'],
    queryFn: getPayouts,
    enabled: isAuthenticated,
  });

  const closedPositions = positions.filter((p) => p.status === PositionStatus.Closed);

  const renderPosition = ({ item }: { item: Position }) => {
    const pnl = Number(item.realizedPnl ?? 0);
    const entry = Number(item.entryPrice ?? 0);
    const exit = item.exitPrice != null ? Number(item.exitPrice) : null;
    const size = Number(item.size ?? 0);
    return (
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 13 }}>
            {MARKET_LABELS[item.market] ?? item.market}, {item.side === PositionSide.Long ? 'buy' : 'sell'} {formatUsd(size)}
          </Text>
          <Text style={{ color: pnl >= 0 ? '#22C55E' : '#EF4444', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' }}>
            {pnl >= 0 ? '+' : ''}{formatUsd(pnl)}
          </Text>
        </View>
        <Text style={{ color: '#555555', fontSize: 11, marginTop: 2 }}>
          {entry.toFixed(2)} {'\u2192'} {exit !== null ? exit.toFixed(2) : '\u2014'} {'\u00b7'} {formatDateTime(item.openedAt)}
        </Text>
      </View>
    );
  };

  const renderPayout = ({ item }: { item: PayoutRequest }) => <DealRow payout={item} />;

  const isLoading = posLoading || payLoading;

  const totalProfit = closedPositions.reduce((s, p) => s + Number(p.realizedPnl ?? 0), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#08080F' }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>History</Text>
      </View>

      {/* Sub-tabs */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222222' }}>
        {(['POSITIONS', 'ORDERS', 'DEALS'] as HistoryTab[]).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{
              flex: 1, paddingVertical: 10, alignItems: 'center',
              borderBottomWidth: 2,
              borderBottomColor: activeTab === tab ? '#7C3AED' : 'transparent',
            }}
          >
            <Text style={{
              color: activeTab === tab ? '#FFFFFF' : '#555555',
              fontSize: 11, fontWeight: '600',
            }}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </View>
      ) : (
        <>
          {activeTab === 'POSITIONS' && (
            <FlatList
              data={closedPositions}
              keyExtractor={(item) => item.id}
              renderItem={renderPosition}
              ListHeaderComponent={closedPositions.length > 0 ? (
                <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
                  {([
                    { label: 'Profit',       value: formatUsd(totalProfit) },
                    { label: 'Total trades', value: closedPositions.length.toString() },
                  ] as const).map(({ label, value }) => (
                    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text style={{ color: '#888888', fontSize: 12 }}>{label}:</Text>
                      <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'monospace' }}>{value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              ListEmptyComponent={
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Text style={{ color: '#555555' }}>No closed positions</Text>
                </View>
              }
            />
          )}
          {activeTab === 'ORDERS' && (
            <FlatList
              data={positions}
              keyExtractor={(item) => item.id}
              renderItem={renderPosition}
              ListEmptyComponent={
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Text style={{ color: '#555555' }}>No orders</Text>
                </View>
              }
            />
          )}
          {activeTab === 'DEALS' && (
            <FlatList
              data={payouts}
              keyExtractor={(item) => item.id}
              renderItem={renderPayout}
              ListEmptyComponent={
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Text style={{ color: '#555555' }}>No payout requests</Text>
                </View>
              }
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}
