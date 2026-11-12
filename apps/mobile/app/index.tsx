import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth';

export default function IndexPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const initFromStorage = useAuthStore((s) => s.initFromStorage);

  useEffect(() => {
    void initFromStorage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace('/(tabs)/dashboard');
    } else {
      router.replace('/connect');
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <View style={{ flex: 1, backgroundColor: '#08080F', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#7C3AED" />
    </View>
  );
}
