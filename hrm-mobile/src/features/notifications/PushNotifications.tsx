import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { notificationKeys, notificationsApi } from './api';
import { isPushConfigured, notificationIdOf, registerForPushAsync, routeForPushData } from './push';

/**
 * Mounted once the user is signed in and inside the app (tab layout), which is when the permission
 * prompt makes sense — never on the first app open. Registers the device for push, shows pushes that
 * arrive in the foreground, refreshes the inbox, and opens the linked screen when a push is tapped
 * (also when the tap launched the app). Renders nothing; does nothing when push is not configured.
 */
export function PushNotifications() {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isPushConfigured()) {
      void registerForPushAsync(); // logs once why push is off
      return;
    }
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    void registerForPushAsync();

    const refresh = () => void qc.invalidateQueries({ queryKey: notificationKeys.all });
    const open = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      const id = notificationIdOf(data);
      if (id) void notificationsApi.markRead(id).then(refresh, () => undefined);
      router.push(routeForPushData(data));
    };

    const launchedFrom = Notifications.getLastNotificationResponse();
    if (launchedFrom) {
      Notifications.clearLastNotificationResponse();
      open(launchedFrom);
    }
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    const received = Notifications.addNotificationReceivedListener(refresh);
    return () => {
      tapped.remove();
      received.remove();
    };
  }, [qc]);

  return null;
}
