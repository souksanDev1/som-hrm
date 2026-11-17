import { isOfflineOverdue, PARAMETERS, translate, type CheckinStatus, type Locale } from '@hrm/shared';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { useCheckinStatus } from './api';
import { getQueueStore, type QueuedPunch } from './queue';

const STATUS_META = 'status';
const ALERTED_META = 'offlineAlertedRef';

/** Last status seen online, for a cold start without a connection (offline capture, FR-ATT-05). */
const readCachedStatus = async (): Promise<CheckinStatus | null> => {
  const raw = await (await getQueueStore()).getMeta(STATUS_META);
  try {
    return raw ? (JSON.parse(raw) as CheckinStatus) : null;
  } catch {
    return null;
  }
};

/** Check-in status from the API, falling back to the last one stored on the phone. */
export const useCheckinContext = (enabled = true) => {
  const query = useCheckinStatus(enabled);
  const [cached, setCached] = useState<CheckinStatus | null>(null);
  useEffect(() => {
    if (query.data) {
      void getQueueStore().then((s) => s.setMeta(STATUS_META, JSON.stringify(query.data)));
      return;
    }
    let live = true;
    void readCachedStatus().then((s) => live && setCached(s));
    return () => {
      live = false;
    };
  }, [query.data]);
  return { query, status: query.data ?? cached };
};

/** `attendance.offlineAlertHours` as last seen from the API, else the parameter's registry default. */
const offlineAlertHours = (status: CheckinStatus | null) => status?.offlineAlertHours ?? PARAMETERS['attendance.offlineAlertHours'].defaultValue;

/** Oldest unsent punch, if any. */
export const oldestPending = (items: readonly QueuedPunch[]): QueuedPunch | null => items.find((i) => i.status === 'pending') ?? null;

/** True when unsent punches are older than `attendance.offlineAlertHours` (FR-ATT-08). */
export const useOfflineOverdue = (status: CheckinStatus | null, items: readonly QueuedPunch[], now: Date = new Date()) => {
  const oldest = oldestPending(items);
  return isOfflineOverdue(oldest ? new Date(oldest.capturedAt) : null, now, offlineAlertHours(status));
};

/**
 * Local notification once per oldest unsent punch when the queue is overdue (FR-ATT-08, FR-NOTI-03.7): the
 * server cannot know about punches it never received, so the phone raises it itself.
 */
export const alertIfOverdue = async (userId: string, locale: Locale, now: Date = new Date()) => {
  const store = await getQueueStore();
  const items = await store.list(userId);
  const oldest = oldestPending(items);
  if (!oldest || !isOfflineOverdue(new Date(oldest.capturedAt), now, offlineAlertHours(await readCachedStatus()))) return false;
  if ((await store.getMeta(ALERTED_META)) === oldest.clientRef) return false;
  const count = String(items.filter((i) => i.status === 'pending').length);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: translate(locale, 'notif.offlineUnsynced.title'),
      body: translate(locale, 'notif.offlineUnsynced.body').replace('{count}', count),
      data: { link: '/checkin' },
    },
    trigger: null,
  }).catch(() => undefined);
  await store.setMeta(ALERTED_META, oldest.clientRef);
  return true;
};
