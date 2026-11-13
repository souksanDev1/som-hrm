import { Text } from 'react-native';
import { Screen, StateScreen } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** Inbox for leave/correction decisions and document expiry (delivered from M3). */
export default function NotificationsScreen() {
  const t = useT();
  return (
    <Screen testID="notifications-screen">
      <Text className="mb-4 text-2xl font-semibold text-ink dark:text-night-ink">{t('nav.notifications')}</Text>
      <StateScreen kind="empty" />
    </Screen>
  );
}
