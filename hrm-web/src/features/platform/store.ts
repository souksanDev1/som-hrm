'use client';
import type { PlatformLoginResponse, PlatformMe, TokenPair } from '@hrm/shared';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useHydrated } from '@/lib/use-hydrated';

interface PlatformAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: PlatformMe | null;
  setSession(res: PlatformLoginResponse): void;
  setTokens(tokens: TokenPair): void;
  setUser(user: PlatformMe): void;
  clear(): void;
}

/**
 * SOM platform session. Stored under its own key so a platform session never mixes
 * with a tenant session in the same browser.
 */
export const usePlatformAuthStore = create<PlatformAuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (res) => set({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user }),
      setTokens: (t) => set({ accessToken: t.accessToken, refreshToken: t.refreshToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'hrm-platform-auth', storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);

/** Rehydrates the platform session (and UI prefs) on the client. */
export const usePlatformHydrated = () => {
  const prefsReady = useHydrated();
  const [ready, setReady] = useState(() => usePlatformAuthStore.persist?.hasHydrated() ?? false);
  useEffect(() => {
    if (ready) return;
    void Promise.resolve(usePlatformAuthStore.persist.rehydrate()).then(() => setReady(true));
  }, [ready]);
  return prefsReady && ready;
};
