'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api-client';
import { usePrefsStore } from '@/lib/i18n';
import { useHydrated } from '@/lib/use-hydrated';

/** Applies the persisted language + theme to <html>. */
function PrefsEffect() {
  const { locale, theme } = usePrefsStore();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [locale, theme]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  useHydrated();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Never retry auth/permission/validation errors.
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <PrefsEffect />
      {children}
    </QueryClientProvider>
  );
}
