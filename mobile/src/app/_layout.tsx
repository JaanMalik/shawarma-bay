import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { colors } from '@/constants/theme';
import { StoreProvider, useStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

function HideSplashWhenReady() {
  const { menu, loadError } = useStore();
  useEffect(() => {
    if (menu || loadError) SplashScreen.hideAsync().catch(() => {});
  }, [menu, loadError]);
  return null;
}

export default function RootLayout() {
  return (
    <StoreProvider>
      <HideSplashWhenReady />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerTransparent: false,
          headerStyle: { backgroundColor: colors.coal },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Menu' }} />
        <Stack.Screen name="item/[id]" options={{ presentation: 'modal', title: '' }} />
        <Stack.Screen name="cart" options={{ title: 'Your order' }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Order placed', gestureEnabled: false, headerBackVisible: false }} />
        <Stack.Screen name="payment-complete" options={{ headerShown: false }} />
      </Stack>
    </StoreProvider>
  );
}
