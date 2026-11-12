import React, { useCallback, useState } from 'react';
import { View, Text, SectionList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Market } from '@setl8/types';
import { MARKET_CATEGORY, MarketCategory } from '@setl8/constants';
import { useMarketStore } from '@/store/market';
import { MarketRow } from '@/components/quotes/MarketRow';
import type { PriceFeed } from '@/store/market';

type Section = { title: string; data: Market[] };

const ALL_MARKETS = Object.values(Market);

function buildSections(): Section[] {
  const crypto: Market[] = [];
  const metals: Market[] = [];
  const indices: Market[] = [];
  const forex: Market[] = [];

  for (const market of ALL_MARKETS) {
    const cat = MARKET_CATEGORY[market];
    if (cat === MarketCategory.CRYPTO) crypto.push(market);
    else if (cat === MarketCategory.METALS) metals.push(market);
    else if (cat === MarketCategory.INDICES) indices.push(market);
    else if (cat === MarketCategory.FOREX) forex.push(market);
  }

  return [
    { title: `Crypto (${crypto.length})`, data: crypto },
    { title: `Metals (${metals.length})`, data: metals },
    { title: `Indices (${indices.length})`, data: indices },
    { title: `Forex (${forex.length})`, data: forex },
  ].filter((s) => s.data.length > 0);
}

const SECTIONS = buildSections();

export default function QuotesScreen() {
  const router = useRouter();
  const prices = useMarketStore((s) => s.prices);
  const setSelectedMarket = useMarketStore((s) => s.setSelectedMarket);
  const [refreshing, setRefreshing] = useState(false);

  const handlePress = useCallback((market: Market) => {
    setSelectedMarket(market);
    router.push('/(tabs)/charts');
  }, [setSelectedMarket, router]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Prices refresh via socket automatically; this is a UX gesture
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const renderItem = useCallback(({ item }: { item: Market }) => (
    <MarketRow
      market={item}
      priceData={prices[item] as PriceFeed | undefined}
      onPress={() => handlePress(item)}
    />
  ), [prices, handlePress]);

  const renderSectionHeader = useCallback(({ section }: { section: Section }) => (
    <View style={{ backgroundColor: '#111111', paddingHorizontal: 16, paddingVertical: 6 }}>
      <Text style={{ color: '#555555', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>
        {section.title.toUpperCase()}
      </Text>
    </View>
  ), []);

  const keyExtractor = useCallback((item: Market) => item, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#08080F' }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1A1A1A',
      }}>
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>Markets</Text>
      </View>

      <SectionList
        sections={SECTIONS}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={10}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
        }
      />
    </SafeAreaView>
  );
}
