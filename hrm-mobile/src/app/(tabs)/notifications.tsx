import { Text } from 'react-native';
import { Screen } from '@/components/ui';
import { NotificationList } from '@/features/notifications/NotificationList';
import { useT } from '@/lib/i18n';

/** Notification inbox (FR-NOTI-01.2/04): unread badge on the tab, mark read, pull to refresh, tap to open the linked screen. */
export default function NotificationsScreen() {
  const t = useT();
  return (
    <Screen testID="notifications-screen" scroll={false}>
      <Text className="mb-4 text-2xl font-semibold text-ink dark:text-night-ink">{t('notif.title')}</Text>
      <NotificationList />
    </Screen>
  );
}
