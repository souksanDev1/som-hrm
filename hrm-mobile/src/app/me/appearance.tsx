import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { EmployeeHeader, Screen } from '@/components/ui';
import { OptionList, OptionRow } from '@/features/settings/OptionRow';
import { usePrefsStore, useT, type ThemePref } from '@/lib/i18n';

const OPTIONS: { value: ThemePref; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { value: 'system', icon: 'settings-suggest' },
  { value: 'light', icon: 'light-mode' },
  { value: 'dark', icon: 'dark-mode' },
];

/** Light / dark / follow-the-phone, opened from the profile tab. */
export default function AppearanceScreen() {
  const t = useT();
  const theme = usePrefsStore((s) => s.theme);
  const setTheme = usePrefsStore((s) => s.setTheme);

  return (
    <Screen testID="appearance-screen" header={<EmployeeHeader title={t('authx.account.appearance')} back testID="appearance" />}>
      <Text className="mb-3 text-sm text-ink-muted dark:text-night-muted">{t('authx.theme.hint')}</Text>
      <OptionList>
        {OPTIONS.map((o, i) => (
          <OptionRow
            key={o.value}
            title={t(`authx.theme.${o.value}`)}
            detail={o.value === 'system' ? t('authx.theme.systemHint') : undefined}
            leading={
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-soft">
                <MaterialIcons name={o.icon} size={22} color="#2C3E91" />
              </View>
            }
            selected={theme === o.value}
            onPress={() => setTheme(o.value)}
            testID={`theme-${o.value}`}
            last={i === OPTIONS.length - 1}
          />
        ))}
      </OptionList>
    </Screen>
  );
}
