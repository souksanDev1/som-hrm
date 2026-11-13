import '../../global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@hrm/shared';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineBanner } from '@/components/ui';

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
        <OfflineBanner />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
