import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, ScrollView, SafeAreaView } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { getNonce, verifyWallet } from '@/lib/api';
import { setToken } from '@/lib/storage';

type WalletName = 'Phantom' | 'Trust Wallet' | 'OKX Wallet' | 'Bitget Wallet';

const WALLETS: { name: WalletName; color: string; scheme: string }[] = [
  { name: 'Phantom',       color: '#AB9FF2', scheme: 'phantom' },
  { name: 'Trust Wallet',  color: '#3375BB', scheme: 'trust' },
  { name: 'OKX Wallet',    color: '#FFFFFF', scheme: 'okex' },
  { name: 'Bitget Wallet', color: '#00C6C6', scheme: 'bitkeep' },
];

export default function ConnectPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [connecting, setConnecting] = useState<WalletName | null>(null);
  const [pendingPublicKey, setPendingPublicKey] = useState<string | null>(null);
  const [pendingNonce, setPendingNonce] = useState<string | null>(null);

  const handleDeepLink = async (url: string) => {
    try {
      const parsed = Linking.parse(url);
      const data = parsed.queryParams?.data;
      const pubkeyParam = parsed.queryParams?.phantom_encryption_public_key ?? pendingPublicKey;

      if (parsed.path === 'verify' && data && pubkeyParam && pendingNonce) {
        const signature = typeof data === 'string' ? data : String(data);
        const pubkeyStr = typeof pubkeyParam === 'string' ? pubkeyParam : String(pubkeyParam);

        const nonce = await getNonce(pubkeyStr);
        const result = await verifyWallet(pubkeyStr, signature, nonce.message);
        await setToken(result.token);
        setAuth(result.token, result.trader);
        router.replace('/(tabs)/quotes');
        return;
      }

      if (parsed.path === 'connect' && pubkeyParam) {
        const pubkeyStr = typeof pubkeyParam === 'string' ? pubkeyParam : String(pubkeyParam);
        setPendingPublicKey(pubkeyStr);
        const nonce = await getNonce(pubkeyStr);
        setPendingNonce(nonce.nonce);

        const redirectUrl = Linking.createURL('verify');
        const payload = btoa(nonce.message);
        const signUrl = `https://phantom.app/ul/v1/signMessage?payload=${encodeURIComponent(payload)}&redirect_link=${encodeURIComponent(redirectUrl)}`;
        await Linking.openURL(signUrl);
      }
    } catch {
      setConnecting(null);
      Alert.alert('Connection failed', 'Please try again.');
    }
  };

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleDeepLink(url);
    });

    void Linking.getInitialURL().then((url) => {
      if (url) void handleDeepLink(url);
    });

    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPublicKey, pendingNonce]);

  const connectPhantom = async () => {
    setConnecting('Phantom');
    try {
      const redirectUrl = Linking.createURL('connect');
      const url = `https://phantom.app/ul/v1/connect?app_url=${encodeURIComponent('https://setl8.com')}&redirect_link=${encodeURIComponent(redirectUrl)}&cluster=devnet`;
      await Linking.openURL(url);
    } catch {
      setConnecting(null);
      Alert.alert('Error', 'Could not open Phantom. Is it installed?');
    }
  };

  const connectOther = (name: WalletName) => {
    Alert.alert('Coming Soon', `${name} integration is coming soon. Use Phantom for now.`);
  };

  const handleWalletPress = (name: WalletName) => {
    if (name === 'Phantom') { void connectPhantom(); }
    else { connectOther(name); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#08080F' }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#08080F' }}
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 }}
      >
        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <View style={{
            width: 64, height: 64, borderRadius: 16,
            backgroundColor: '#7C3AED',
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '800' }}>S</Text>
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 }}>
            SETL8
          </Text>
          <Text style={{ color: '#888888', fontSize: 14, marginTop: 6, textAlign: 'center' }}>
            The world's first onchain DeFi prop firm
          </Text>
        </View>

        {/* Subtitle */}
        <Text style={{ color: '#888888', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>
          Connect your wallet to start trading
        </Text>

        {/* Wallet buttons - direct children of ScrollView */}
        {WALLETS.map(({ name, color }) => (
          <Pressable
            key={name}
            onPress={() => handleWalletPress(name)}
            disabled={connecting !== null}
            style={({ pressed }) => ({
              width: '100%',
              backgroundColor: '#111111',
              borderWidth: 1,
              borderColor: pressed ? '#444444' : '#222222',
              borderRadius: 12,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              opacity: connecting !== null && connecting !== name ? 0.5 : 1,
              marginBottom: 12,
            })}
          >
            <View style={{
              width: 36, height: 36, borderRadius: 8,
              backgroundColor: '#1A1A1A',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color, fontSize: 16, fontWeight: '700' }}>
                {name[0]}
              </Text>
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600', flex: 1 }}>
              {name}
            </Text>
            {connecting === name && (
              <ActivityIndicator size="small" color="#7C3AED" />
            )}
          </Pressable>
        ))}

        {/* Terms text */}
        <Text style={{ color: '#555555', fontSize: 12, marginTop: 32, textAlign: 'center' }}>
          By connecting, you agree to our Terms of Service
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
