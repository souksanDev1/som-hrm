import type { Locale } from '@hrm/shared';
import { Text } from 'react-native';
import { EmployeeHeader, Screen } from '@/components/ui';
import { useChangeLocale } from '@/features/auth/hooks';
import { LANGUAGE_FLAGS, OptionList, OptionRow } from '@/features/settings/OptionRow';
import { usePrefsStore, useT } from '@/lib/i18n';

/** Language picker, opened from the profile tab. */
export default function LanguageScreen() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const changeLocale = useChangeLocale();
  const options: Locale[] = ['lo', 'en'];

  return (
    <Screen testID="language-screen" header={<EmployeeHeader title={t('authx.account.language')} back testID="language" />}>
      <Text className="mb-3 text-sm text-ink-muted dark:text-night-muted">{t('authx.language.hint')}</Text>
      <OptionList>
        {options.map((l, i) => (
          <OptionRow
            key={l}
            title={t(`authx.language.${l}`)}
            leading={<Text className="text-3xl">{LANGUAGE_FLAGS[l]}</Text>}
            selected={locale === l}
            onPress={() => locale !== l && changeLocale(l)}
            testID={`language-${l}`}
            last={i === options.length - 1}
          />
        ))}
      </OptionList>
    </Screen>
  );
}
