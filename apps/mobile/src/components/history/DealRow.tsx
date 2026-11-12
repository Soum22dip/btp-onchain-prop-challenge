import React from 'react';
import { View, Text } from 'react-native';
import type { PayoutRequest } from '@setl8/types';
import { formatUsd, formatDateTime } from '@/lib/utils';

interface DealRowProps {
  payout: PayoutRequest;
}

export function DealRow({ payout }: DealRowProps) {
  const isComplete = payout.status === 'COMPLETED';
  const statusColor = isComplete
    ? '#22C55E'
    : payout.status === 'REJECTED'
      ? '#EF4444'
      : '#F59E0B';

  return (
    <View style={{
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#1A1A1A',
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 13 }}>Payout Request</Text>
        <Text style={{ color: '#888888', fontSize: 11 }}>
          {formatDateTime(payout.requestedAt ?? null)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ color: '#888888', fontSize: 12 }}>
          {payout.tokenSymbol ?? 'USDC'} {formatUsd(Number(payout.amountUsd ?? 0))}
        </Text>
        <Text style={{ color: statusColor, fontSize: 11, fontWeight: '600' }}>
          {payout.status ?? 'PENDING'}
        </Text>
      </View>
    </View>
  );
}
