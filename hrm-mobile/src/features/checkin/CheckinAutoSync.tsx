import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore } from '@/lib/i18n';
import { alertIfOverdue } from './hooks';
import { syncNow, useCheckinQueue } from './sync';

/**
 * Keeps the offline queue moving while signed in (FR-ATT-05.1): syncs at start, when the connection comes
 * back and when the app returns to the foreground, then refreshes the check-in data and checks the alert.
 */
export function CheckinAutoSync() {
  const qc = useQueryClient();
  useEffect(() => {
    let wasConnected: boolean | null = null;
    const run = async () => {
      const outcome = await syncNow().catch(() => null);
      if (outcome && (outcome.accepted.length || outcome.rejected.length)) await qc.invalidateQueries({ queryKey: ['checkin'] });
      const userId = useAuthStore.getState().user?.id;
      if (userId) await alertIfOverdue(userId, usePrefsStore.getState().locale).catch(() => false);
    };
    void useCheckinQueue.getState().refresh().then(run);
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true;
      if (connected && wasConnected === false) void run();
      wasConnected = state.isConnected;
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void run();
    });
    return () => {
      unsubscribeNet();
      appState.remove();
    };
  }, [qc]);
  return null;
}
