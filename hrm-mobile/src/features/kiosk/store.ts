import type { KioskInfo } from '@hrm/shared';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { usePrefsStore } from '@/lib/i18n';
import { secureStorage } from '@/lib/secure-storage';

interface KioskState {
  /** Enrol code from HR (FR-ATT-03.1), kept in SecureStore; sent as `Authorization: Kiosk <token>`. */
  token: string | null;
  /** Last `GET /kiosk/me`, so the idle screen still shows the branch while offline. */
  info: KioskInfo | null;
  enrol(token: string, info: KioskInfo): void;
  setInfo(info: KioskInfo): void;
  /** Forget the enrolment (revoked or unknown token): back to the enrol screen. */
  clear(): void;
}

export const useKioskStore = create<KioskState>()(
  persist(
    (set) => ({
      token: null,
      info: null,
      enrol: (token, info) => set({ token, info }),
      setInfo: (info) => set({ info }),
      clear: () => set({ token: null, info: null }),
    }),
    { name: 'hrm-kiosk', storage: createJSONStorage(() => secureStorage) },
  ),
);

/** Queue owner id of this tablet in the shared punch queue. */
export const kioskQueueOwner = (info: Pick<KioskInfo, 'id'>) => `kiosk:${info.id}`;

/** True once the kiosk enrolment and the language were read from SecureStore. */
export const useKioskHydration = () => {
  const [done, setDone] = useState(() => useKioskStore.persist.hasHydrated() && usePrefsStore.persist.hasHydrated());
  useEffect(() => {
    if (done) return;
    const check = () => setDone(useKioskStore.persist.hasHydrated() && usePrefsStore.persist.hasHydrated());
    const unsubs = [useKioskStore.persist.onFinishHydration(check), usePrefsStore.persist.onFinishHydration(check)];
    check();
    return () => unsubs.forEach((u) => u());
  }, [done]);
  return done;
};
