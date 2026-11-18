import type { KioskInfo, KioskPunchItemResult } from '@hrm/shared';
import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { kioskApi } from './api';
import { KioskFlow, type KioskOutcome, type KioskPunchRequest } from './KioskFlow';
import { enqueueKioskPunch, getKioskQueueStore, syncKioskNow, useKioskQueue } from './queue';
import { kioskQueueOwner, useKioskStore } from './store';

/** Retry sending the queue this often while the tablet is idle (technical, not a business rule). */
const SYNC_INTERVAL_MS = 60_000;

/** What the confirmation shows for one queued punch after a sync attempt. */
export const outcomeFor = (result: KioskPunchItemResult | undefined, capturedAt: string): KioskOutcome => {
  if (!result) return { kind: 'queued', capturedAt };
  if (result.result === 'rejected') return { kind: 'error', code: result.error ?? 'unknown' };
  return { kind: 'done', employeeName: result.employee?.name ?? '', punchKind: result.punch?.kind ?? 'IN', capturedAt: result.punch?.capturedAt ?? capturedAt };
};

/** Queue a kiosk punch, then send it now if the connection allows (FR-ATT-03 + FR-ATT-05). */
export const submitKioskPunch = async (info: KioskInfo, req: KioskPunchRequest, now: Date = new Date()): Promise<KioskOutcome> => {
  const capturedAt = now.toISOString();
  const store = await getKioskQueueStore();
  const clientRef = await enqueueKioskPunch(store, kioskQueueOwner(info), { ...req, capturedAt });
  const find = (o: { accepted: KioskPunchItemResult[]; rejected: KioskPunchItemResult[] }) => [...o.accepted, ...o.rejected].find((r) => r.clientRef === clientRef);
  let outcome = await syncKioskNow();
  // A sync already running when the punch was queued did not include it: run once more.
  if (!find(outcome) && !outcome.offline) outcome = await syncKioskNow();
  return outcomeFor(find(outcome), capturedAt);
};

/**
 * The enrolled kiosk: refreshes its branch info, keeps the offline queue moving (start, reconnect, foreground,
 * every minute) and runs the punch flow.
 */
export function KioskScreen({ info }: { info: KioskInfo }) {
  const pending = useKioskQueue((s) => s.pending);

  useEffect(() => {
    const run = () => void syncKioskNow().catch(() => null);
    void kioskApi
      .me()
      .then((fresh) => useKioskStore.getState().setInfo(fresh))
      .catch(() => null);
    void useKioskQueue.getState().refresh().then(run);
    let wasConnected: boolean | null = null;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected === true && wasConnected === false) run();
      wasConnected = state.isConnected;
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') run();
    });
    const timer = setInterval(run, SYNC_INTERVAL_MS);
    return () => {
      unsubscribeNet();
      appState.remove();
      clearInterval(timer);
    };
  }, []);

  return <KioskFlow info={info} pending={pending} submit={(req) => submitKioskPunch(info, req)} />;
}
