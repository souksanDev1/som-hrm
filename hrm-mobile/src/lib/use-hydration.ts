import { useEffect, useState } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore } from './i18n';

/** True once persisted stores have been read from SecureStore. */
export const useHydration = () => {
  const [done, setDone] = useState(() => useAuthStore.persist.hasHydrated() && usePrefsStore.persist.hasHydrated());
  useEffect(() => {
    if (done) return;
    const check = () => setDone(useAuthStore.persist.hasHydrated() && usePrefsStore.persist.hasHydrated());
    const unsubs = [useAuthStore.persist.onFinishHydration(check), usePrefsStore.persist.onFinishHydration(check)];
    check();
    return () => unsubs.forEach((u) => u());
  }, [done]);
  return done;
};
