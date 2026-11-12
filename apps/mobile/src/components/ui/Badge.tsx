import React from 'react';
import { View, Text } from 'react-native';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'primary' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: 'rgba(34,197,94,0.15)',   text: '#22C55E' },
  danger:  { bg: 'rgba(239,68,68,0.15)',   text: '#EF4444' },
  warning: { bg: 'rgba(245,158,11,0.15)',  text: '#F59E0B' },
  primary: { bg: 'rgba(124,58,237,0.15)',  text: '#7C3AED' },
  neutral: { bg: 'rgba(136,136,136,0.15)', text: '#888888' },
};

export function Badge({ label, variant = 'neutral' }: BadgeProps) {
  const styles = variantStyles[variant];
  return (
    <View style={{
      backgroundColor: styles.bg,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    }}>
      <Text style={{ color: styles.text, fontSize: 10, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}
