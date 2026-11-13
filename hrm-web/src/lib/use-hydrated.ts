'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore } from './i18n';

/** Rehydrates persisted stores on the client (they skip hydration to avoid SSR mismatches). */
export const useHydrated = () => {
  // `persist` is undefined during SSR/prerender (no localStorage).
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist?.hasHydrated() ?? false);
  useEffect(() => {
    if (hydrated) return;
    void Promise.all([useAuthStore.persist.rehydrate(), usePrefsStore.persist.rehydrate()]).then(() => setHydrated(true));
  }, [hydrated]);
  return hydrated;
};
