'use client';
import { translate, type Locale, type TranslationKey } from '@hrm/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface PrefsState {
  locale: Locale;
  theme: Theme;
  setLocale(locale: Locale): void;
  toggleTheme(): void;
}

/** UI preferences (language + theme), persisted per browser. */
export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      locale: 'lo',
      theme: 'light',
      setLocale: (locale) => set({ locale }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
    }),
    { name: 'hrm-prefs', storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);

/** Translation hook. Accepts dictionary keys or raw API error codes. */
export const useT = () => {
  const locale = usePrefsStore((s) => s.locale);
  return (key: TranslationKey | string) => translate(locale, key);
};
