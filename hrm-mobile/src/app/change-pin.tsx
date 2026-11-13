import { router } from 'expo-router';
import { Text } from 'react-native';
import { Card, Screen } from '@/components/ui';
import { ChangePinForm } from '@/features/auth/ChangePinForm';
import { useT } from '@/lib/i18n';

/** Shown after a first login with a temporary PIN issued by HR, and from the profile. */
export default function ChangePinScreen() {
  const t = useT();
  return (
    <Screen testID="change-pin-screen">
      <Text className="mb-4 text-xl font-semibold text-ink dark:text-night-ink">{t('auth.changePin')}</Text>
      <Card>
        <ChangePinForm onSuccess={() => router.replace('/home')} />
      </Card>
    </Screen>
  );
}
