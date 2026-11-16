import { Redirect, router } from 'expo-router';
import { Text } from 'react-native';
import { Button, Card, Screen } from '@/components/ui';
import { homeRouteFor, useLogout } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { VerifyPhoneForm } from '@/features/auth/VerifyPhoneForm';
import { useT } from '@/lib/i18n';

/** First-login phone verification by SMS OTP (FR-AUTH-02.1); the API blocks other routes until done. */
export default function VerifyPhoneScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const logout = useLogout();
  if (!token) return <Redirect href="/login" />;
  return (
    <Screen testID="verify-phone-screen">
      <Text className="mb-4 text-xl font-semibold text-ink dark:text-night-ink">{t('authx.setup.verifyPhoneTitle')}</Text>
      <Card>
        <VerifyPhoneForm onSuccess={() => router.replace(homeRouteFor(useAuthStore.getState().user))} />
      </Card>
      <Button
        title={t('auth.logout')}
        variant="ghost"
        onPress={async () => {
          await logout();
          router.replace('/login');
        }}
      />
    </Screen>
  );
}
