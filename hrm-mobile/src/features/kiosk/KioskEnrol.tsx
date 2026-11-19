import type { KioskInfo } from '@hrm/shared';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { BrandLogo, Button, Card, Screen, Segmented, TextField } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { usePrefsStore, useT } from '@/lib/i18n';

export interface KioskEnrolProps {
  /** Check the code against the API (`GET /kiosk/me`). */
  verify(code: string): Promise<KioskInfo>;
  onEnrolled(code: string, info: KioskInfo): void;
}

/**
 * Kiosk enrolment (FR-ATT-03.1): HR creates the tablet under Settings › Kiosk devices and the code shown once is
 * pasted here; the app keeps it in SecureStore.
 */
export function KioskEnrol({ verify, onEnrolled }: KioskEnrolProps) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const setLocale = usePrefsStore((s) => s.setLocale);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = code.trim();
    if (!value) {
      setError('required');
      return;
    }
    setBusy(true);
    try {
      const info = await verify(value);
      setError(null);
      onEnrolled(value, info);
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="kiosk-enrol-screen">
      <View className="gap-4">
        <Segmented
          value={locale}
          onChange={setLocale}
          options={[
            { value: 'lo', label: 'ລາວ', testID: 'kiosk-lang-lo' },
            { value: 'en', label: 'English', testID: 'kiosk-lang-en' },
          ]}
        />
        <BrandLogo height={96} />
        <Text className="text-2xl font-semibold text-ink dark:text-night-ink">{t('kiosk.app.title')}</Text>
        <Card title={t('kiosk.enrol.title')}>
          <View className="gap-4">
            <Text className="text-sm text-ink-muted">{t('kiosk.enrol.body')}</Text>
            <TextField
              label={t('kiosk.enrol.code')}
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoCorrect={false}
              error={error ? t(error) : undefined}
              testID="kiosk-enrol-code"
              required
            />
            <Button title={t('kiosk.enrol.submit')} loading={busy} onPress={() => void submit()} testID="kiosk-enrol-submit" />
          </View>
        </Card>
      </View>
    </Screen>
  );
}
