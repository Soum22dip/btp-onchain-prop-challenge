import React from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AttemptPhase, AttemptStatus } from '@setl8/types';
import { PROFIT_TARGET_PERCENT, MAX_DRAWDOWN_PERCENT } from '@setl8/constants';
import { useAuthStore } from '@/store/auth';
import { usePnlStore } from '@/store/pnl';
import { getAttempts, getOverviewStats, getVaultBalance, getPnl } from '@/lib/api';
import { formatUsd, formatPercent } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';

export default function DashboardScreen() {
  const router = useRouter();
  const { trader, isAuthenticated } = useAuthStore();
  const pnl = usePnlStore();

  const { data: attempts = [], isLoading: attemptsLoading, refetch: refetchAttempts } = useQuery({
    queryKey: ['attempts'],
    queryFn: getAttempts,
    enabled: isAuthenticated,
  });

  const { data: pnlData, refetch: refetchPnl } = useQuery({
    queryKey: ['pnl'],
    queryFn: getPnl,
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  const { data: vault, refetch: refetchVault } = useQuery({
    queryKey: ['vault'],
    queryFn: getVaultBalance,
    staleTime: 60000,
  });

  const { data: stats } = useQuery({
    queryKey: ['overview-stats'],
    queryFn: getOverviewStats,
    staleTime: 30000,
  });

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAttempts(), refetchPnl(), refetchVault()]);
    setRefreshing(false);
  }, [refetchAttempts, refetchPnl, refetchVault]);

  const activeAttempt = attempts.find((a) => a.status === AttemptStatus.Active);

  const balance = pnl.currentBalance > 0 ? pnl.currentBalance : pnl.startingBalance;
  const pnlPct = pnl.pnlPercent;
  const ddPct = pnl.drawdownPercent;
  const targetLimit = Number(PROFIT_TARGET_PERCENT) * 100;
  const drawdownLimit = Number(MAX_DRAWDOWN_PERCENT) * 100;
  const targetProgress = targetLimit > 0 ? Math.min((pnlPct / targetLimit) * 100, 100) : 0;
  const ddProgress = drawdownLimit > 0 ? Math.min((ddPct / drawdownLimit) * 100, 100) : 0;

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#08080F', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '800' }}>S</Text>
        </View>
        <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 6 }}>SETL8</Text>
        <Text style={{ color: '#888888', fontSize: 14, marginBottom: 24 }}>Connect your wallet to get started</Text>
        <Pressable
          onPress={() => router.push('/connect')}
          style={{ backgroundColor: '#7C3AED', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10 }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Connect Wallet</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#08080F' }}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
        }
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <Text style={{ color: '#888888', fontSize: 13 }}>Welcome back</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>Dashboard</Text>
        </View>

        {/* Balance card */}
        <View style={{
          marginHorizontal: 16,
          marginTop: 8,
          backgroundColor: '#111111',
          borderRadius: 16,
          padding: 20,
          borderWidth: 1,
          borderColor: '#1A1A1A',
        }}>
          <Text style={{ color: '#888888', fontSize: 12, marginBottom: 4 }}>Account Balance</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: '800', fontFamily: 'monospace' }}>
            {formatUsd(balance)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pnlPct >= 0 ? '#22C55E' : '#EF4444' }} />
              <Text style={{ color: pnlPct >= 0 ? '#22C55E' : '#EF4444', fontSize: 14, fontWeight: '700', fontFamily: 'monospace' }}>
                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
              </Text>
            </View>
            {activeAttempt && (
              <Badge
                label={activeAttempt.phase === AttemptPhase.Funded ? 'Funded' : 'Evaluation'}
                variant={activeAttempt.phase === AttemptPhase.Funded ? 'success' : 'primary'}
              />
            )}
          </View>
        </View>

        {/* Progress bars */}
        {activeAttempt && (
          <View style={{
            marginHorizontal: 16,
            marginTop: 12,
            backgroundColor: '#111111',
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: '#1A1A1A',
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginBottom: 12 }}>
              Attempt #{activeAttempt.attemptNumber} of 7
            </Text>

            {/* Profit target */}
            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: '#888888', fontSize: 11 }}>Profit Target (+8%)</Text>
                <Text style={{ color: '#22C55E', fontSize: 11, fontFamily: 'monospace' }}>
                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                </Text>
              </View>
              <View style={{ height: 6, backgroundColor: '#1A1A1A', borderRadius: 3 }}>
                <View style={{
                  height: 6,
                  backgroundColor: '#22C55E',
                  borderRadius: 3,
                  width: `${Math.max(0, Math.min(targetProgress, 100))}%`,
                }} />
              </View>
            </View>

            {/* Drawdown */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: '#888888', fontSize: 11 }}>Drawdown Limit (8%)</Text>
                <Text style={{ color: '#F59E0B', fontSize: 11, fontFamily: 'monospace' }}>
                  {ddPct.toFixed(1)}%
                </Text>
              </View>
              <View style={{ height: 6, backgroundColor: '#1A1A1A', borderRadius: 3 }}>
                <View style={{
                  height: 6,
                  backgroundColor: ddPct > 6 ? '#EF4444' : '#F59E0B',
                  borderRadius: 3,
                  width: `${Math.max(0, Math.min(ddProgress, 100))}%`,
                }} />
              </View>
            </View>
          </View>
        )}

        {/* Quick stats row */}
        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 12 }}>
          {([
            { label: 'Realized', value: formatUsd(pnl.realizedPnl), color: pnl.realizedPnl >= 0 ? '#22C55E' : '#EF4444' },
            { label: 'Unrealized', value: formatUsd(pnl.unrealizedPnl), color: pnl.unrealizedPnl >= 0 ? '#22C55E' : '#EF4444' },
            { label: 'Drawdown', value: `${ddPct.toFixed(1)}%`, color: '#F59E0B' },
          ] as const).map(({ label, value, color }) => (
            <View key={label} style={{
              flex: 1,
              backgroundColor: '#111111',
              borderRadius: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: '#1A1A1A',
            }}>
              <Text style={{ color: '#555555', fontSize: 10, marginBottom: 2 }}>{label}</Text>
              <Text style={{ color, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' }}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Quick actions */}
        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 16 }}>
          <Pressable
            onPress={() => router.push('/(tabs)/charts')}
            style={{ flex: 1, backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Trade Now</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/quotes')}
            style={{ flex: 1, backgroundColor: '#111111', borderWidth: 1, borderColor: '#222222', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>Markets</Text>
          </Pressable>
        </View>

        {/* Vault card */}
        {vault !== undefined && (
          <View style={{
            marginHorizontal: 16,
            marginTop: 16,
            backgroundColor: '#111111',
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: '#1A1A1A',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: '#888888', fontSize: 11, marginBottom: 2 }}>Vault Balance</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800', fontFamily: 'monospace' }}>
                  {formatUsd(Number(vault.balanceUsd ?? 0))}
                </Text>
              </View>
              <View style={{ backgroundColor: '#7C3AED20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: '#7C3AED', fontSize: 11, fontWeight: '600' }}>Proof of Reserves</Text>
              </View>
            </View>
          </View>
        )}

        {/* Platform stats */}
        {stats && (
          <View style={{
            marginHorizontal: 16,
            marginTop: 12,
            marginBottom: 32,
            backgroundColor: '#111111',
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: '#1A1A1A',
          }}>
            <Text style={{ color: '#888888', fontSize: 12, marginBottom: 12 }}>Platform Stats</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              {([
                { label: 'Traders', value: String(stats.totalTraders) },
                { label: 'Active', value: String(stats.activeTraders) },
                { label: 'Paid Out', value: formatUsd(Number(stats.totalPayoutsUsd ?? 0)) },
                { label: 'Pass Rate', value: `${(Number(stats.passRate ?? 0) * 100).toFixed(1)}%` },
              ] as const).map(({ label, value }) => (
                <View key={label} style={{ width: '45%' }}>
                  <Text style={{ color: '#555555', fontSize: 10 }}>{label}</Text>
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontFamily: 'monospace' }}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
