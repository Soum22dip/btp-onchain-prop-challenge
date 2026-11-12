import React from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import { AttemptPhase } from '@setl8/types';
import { PROFIT_TARGET_PERCENT, MAX_DRAWDOWN_PERCENT } from '@setl8/constants';
import { useAuthStore } from '@/store/auth';
import { usePnlStore } from '@/store/pnl';
import { getAttempts, getNextPayoutBatch, getVaultBalance } from '@/lib/api';
import { formatUsd, truncateAddress, formatCountdown } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';

export default function AccountScreen() {
  const router = useRouter();
  const { trader, isAuthenticated, clearAuth } = useAuthStore();
  const { currentBalance, startingBalance, pnlPercent, drawdownPercent } = usePnlStore();

  const { data: attempts = [], isLoading: attemptsLoading } = useQuery({
    queryKey: ['attempts'],
    queryFn: getAttempts,
    enabled: isAuthenticated,
  });

  const { data: nextBatch } = useQuery({
    queryKey: ['next-batch'],
    queryFn: getNextPayoutBatch,
    enabled: isAuthenticated,
  });

  const { data: vault } = useQuery({
    queryKey: ['vault'],
    queryFn: getVaultBalance,
    staleTime: 60000,
  });

  const activeAttempt = attempts.find((a) => a.status === 'ACTIVE');
  const balance = currentBalance > 0 ? currentBalance : startingBalance;
  const targetLimit = Number(PROFIT_TARGET_PERCENT) * 100;
  const drawdownLimitNum = Number(MAX_DRAWDOWN_PERCENT) * 100;
  const targetPct = targetLimit > 0 ? Math.min((pnlPercent / targetLimit) * 100, 100) : 0;
  const ddPct = drawdownLimitNum > 0 ? Math.min((drawdownPercent / drawdownLimitNum) * 100, 100) : 0;

  const handleCopyAddress = async () => {
    if (trader?.walletAddress) {
      await Clipboard.setStringAsync(trader.walletAddress);
      Alert.alert('Copied', 'Wallet address copied to clipboard');
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to disconnect?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          clearAuth();
          router.replace('/connect');
        },
      },
    ]);
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#08080F', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#888888', marginBottom: 16 }}>Connect your wallet to view account</Text>
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
      <ScrollView>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>Account</Text>
        </View>

        {/* Wallet card */}
        <Pressable
          onPress={() => { void handleCopyAddress(); }}
          style={{ margin: 16, backgroundColor: '#111111', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#222222' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: '#7C3AED', fontWeight: '800', fontSize: 14, letterSpacing: 1 }}>SETL8</Text>
            <Badge
              label={activeAttempt?.phase === AttemptPhase.Funded ? 'Funded' : 'Evaluation'}
              variant="primary"
            />
          </View>
          <Text style={{ color: '#FFFFFF', fontFamily: 'monospace', fontSize: 14 }}>
            {trader ? truncateAddress(trader.walletAddress, 6) : '\u2014'} \u00b7 Setl8 Prop
          </Text>
          <Text style={{ color: '#555555', fontSize: 11, marginTop: 4 }}>Tap to copy address</Text>
        </Pressable>

        {/* Active attempt card */}
        {attemptsLoading ? (
          <View style={{ padding: 24, alignItems: 'center' }}><Spinner /></View>
        ) : activeAttempt ? (
          <View style={{
            marginHorizontal: 16,
            backgroundColor: '#111111',
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: '#222222',
            marginBottom: 16,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
                Attempt #{activeAttempt.attemptNumber}
              </Text>
              <Badge
                label={activeAttempt.phase === AttemptPhase.Funded ? 'Funded' : 'Evaluation'}
                variant={activeAttempt.phase === AttemptPhase.Funded ? 'success' : 'warning'}
              />
            </View>
            <Text style={{ color: '#555555', fontSize: 12, marginBottom: 12 }}>
              Account: {formatUsd(Number(activeAttempt.accountSize ?? 0))}
            </Text>

            {/* Stats */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              {([
                { label: 'Balance',  value: formatUsd(balance),                                                color: undefined },
                { label: 'P&L',      value: `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`,        color: pnlPercent >= 0 ? '#22C55E' : '#EF4444' },
                { label: 'Drawdown', value: `${drawdownPercent.toFixed(1)}%`,                                  color: '#F59E0B' },
              ] as const).map(({ label, value, color }) => (
                <View key={label} style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#555555', fontSize: 10, marginBottom: 2 }}>{label}</Text>
                  <Text style={{ color: color ?? '#FFFFFF', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' }}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>

            {/* Progress bars */}
            {([
              { label: 'Target',   pct: targetPct, value: `${pnlPercent.toFixed(2)}%`,    color: '#22C55E' },
              { label: 'Drawdown', pct: ddPct,      value: `${drawdownPercent.toFixed(1)}%`, color: '#F59E0B' },
            ] as const).map(({ label, pct, value, color }) => (
              <View key={label} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Text style={{ color: '#555555', fontSize: 10 }}>{label}</Text>
                  <Text style={{ color, fontSize: 10 }}>{value}</Text>
                </View>
                <View style={{ height: 4, backgroundColor: '#222222', borderRadius: 2 }}>
                  <View style={{
                    height: 4,
                    backgroundColor: color,
                    borderRadius: 2,
                    width: `${Math.max(0, Math.min(pct, 100))}%`,
                  }} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ marginHorizontal: 16, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#555555' }}>No active attempt</Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 16 }}>
          <Pressable
            style={{ flex: 1, backgroundColor: '#7C3AED', borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}
            onPress={() => Alert.alert('Buy Challenge', 'Visit setl8.com to purchase a challenge.')}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Buy Challenge</Text>
          </Pressable>
          {activeAttempt?.phase === AttemptPhase.Funded && (
            <Pressable
              style={{ flex: 1, backgroundColor: '#22C55E', borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}
              onPress={() => Alert.alert('Request Payout', 'Payout requests coming soon in app.')}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Request Payout</Text>
            </Pressable>
          )}
        </View>

        {/* Next payout */}
        {nextBatch !== undefined && (
          <View style={{
            marginHorizontal: 16,
            backgroundColor: '#111111',
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: '#222222',
            marginBottom: 16,
          }}>
            <Text style={{ color: '#888888', fontSize: 12, marginBottom: 8 }}>Next Payout Batch</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700', fontFamily: 'monospace' }}>
              {formatCountdown(nextBatch.nextBatchAt)}
            </Text>
            <Text style={{ color: '#555555', fontSize: 12, marginTop: 4 }}>
              {formatUsd(Number(nextBatch.pendingAmountUsd ?? 0))} pending
            </Text>
          </View>
        )}

        {/* Vault balance */}
        {vault !== undefined && (
          <View style={{
            marginHorizontal: 16,
            backgroundColor: '#111111',
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: '#222222',
            marginBottom: 16,
          }}>
            <Text style={{ color: '#888888', fontSize: 12, marginBottom: 4 }}>Vault Balance (Proof of Reserves)</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800', fontFamily: 'monospace' }}>
              {formatUsd(Number(vault.balanceUsd ?? 0))}
            </Text>
          </View>
        )}

        {/* Sign out */}
        <Pressable
          onPress={handleLogout}
          style={{
            marginHorizontal: 16,
            marginBottom: 32,
            borderWidth: 1,
            borderColor: '#333333',
            borderRadius: 8,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#888888', fontWeight: '600' }}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
