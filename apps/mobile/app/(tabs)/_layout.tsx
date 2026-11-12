import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useSocket } from '@/hooks/useSocket';

interface TabIconProps {
  color: string;
  focused?: boolean;
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{icon}</Text>;
}

export default function TabsLayout() {
  // Connect socket in tab layout so it persists across tabs
  useSocket();

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#08080F',
          borderTopColor: '#1A1A1A',
          borderTopWidth: 1,
          height: 56,
          paddingBottom: 4,
        },
        tabBarActiveTintColor: '#7C3AED',
        tabBarInactiveTintColor: '#555555',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }: TabIconProps) => <TabIcon icon={'\u25C9'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="quotes"
        options={{
          title: 'Markets',
          tabBarIcon: ({ color }: TabIconProps) => <TabIcon icon={'\u2261'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="charts"
        options={{
          title: 'Trade',
          tabBarIcon: ({ color }: TabIconProps) => <TabIcon icon={'\u27E1'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="trade"
        options={{
          title: 'Positions',
          tabBarIcon: ({ color }: TabIconProps) => <TabIcon icon={'\u2637'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }: TabIconProps) => <TabIcon icon={'\u29D6'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }: TabIconProps) => <TabIcon icon={'\u2B24'} color={color} />,
        }}
      />
    </Tabs>
  );
}
