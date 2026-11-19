import '../../global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@hrm/shared';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colorScheme } from 'nativewind';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineBanner } from '@/components/ui';
import { usePrefsStore } from '@/lib/i18n';

export default function RootLayout() {
  const pathname = usePathname();
  const blueHeader = ['/home', '/profile', '/org', '/leave', '/leave-calendar'].includes(pathname) || pathname.startsWith('/me/');
  const theme = usePrefsStore((s) => s.theme);
  // Apply the saved light/dark choice; "system" hands control back to the phone.
  useEffect(() => colorScheme.set(theme), [theme]);
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
        <StatusBar style={blueHeader ? 'light' : 'auto'} />
        <Stack screenOptions={{ headerShown: false }} />
        <OfflineBanner />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
