import { Redirect, router } from 'expo-router';
import { Text } from 'react-native';
import { Card, Screen } from '@/components/ui';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';
import { ChangePinForm } from '@/features/auth/ChangePinForm';
import { homeRouteFor } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';

/**
 * Forced replacement of the temporary secret issued by HR (FR-AUTH-03.2), an initial PIN (B5),
 * or a voluntary PIN change from the profile. A password-only user forced to change gets the
 * password form (setting a first PIN alone would not replace the temporary password).
 */
export default function ChangePinScreen() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!token) return <Redirect href="/login" />;

  const forced = !!user?.mustChangeCredential;
  const hasPin = user?.hasPin ?? true;
  const passwordOnly = forced && !!user?.hasPassword && !hasPin;
  const next = () => router.replace(homeRouteFor(useAuthStore.getState().user));
  const title = passwordOnly ? 'authx.password.change' : hasPin ? 'auth.changePin' : 'authx.pin.set';

  return (
    <Screen testID="change-pin-screen">
      <Text className="mb-2 text-xl font-semibold text-ink dark:text-night-ink">{t(title)}</Text>
      {forced ? <Text testID="forced-change-intro" className="mb-4 text-sm text-ink-muted">{t('authx.setup.changeIntro')}</Text> : null}
      {!forced && !hasPin ? <Text className="mb-4 text-sm text-ink-muted">{t('authx.pin.setIntro')}</Text> : null}
      <Card>
        {passwordOnly ? <ChangePasswordForm onSuccess={next} /> : <ChangePinForm hasPin={hasPin} onSuccess={next} />}
      </Card>
    </Screen>
  );
}
