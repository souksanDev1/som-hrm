import { translate, type Locale, type TranslationKey } from '@hrm/shared';
import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from './secure-storage';

const deviceLocale = (): Locale => (getLocales()[0]?.languageCode === 'en' ? 'en' : 'lo');

interface PrefsState {
  locale: Locale;
  setLocale(locale: Locale): void;
}

export const usePrefsStore = create<PrefsState>()(
  persist((set) => ({ locale: deviceLocale(), setLocale: (locale) => set({ locale }) }), {
    name: 'hrm-prefs',
    storage: createJSONStorage(() => secureStorage),
  }),
);

/** Translation hook. Accepts dictionary keys or raw API error codes. */
export const useT = () => {
  const locale = usePrefsStore((s) => s.locale);
  return (key: TranslationKey | string) => translate(locale, key);
};
