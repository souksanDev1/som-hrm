import { ApiError, PUNCH_BATCH_MAX, type DeviceInfo, type PunchBatchInput, type PunchBatchResponse, type PunchItemResult } from '@hrm/shared';
import { create } from 'zustand';
import { useAuthStore } from '@/features/auth/store';
import { checkinApi } from './api';
import { getDeviceInfo } from './device';
import { isDeviceRooted } from './integrity';
import { getQueueStore, type QueuedPunch, type QueueStore } from './queue';

export interface SyncDeps {
  store: QueueStore;
  /** Signed-in user: only their punches are sent. */
  userId: string;
  submit(body: PunchBatchInput): Promise<PunchBatchResponse>;
  uploadSelfie(uri: string): Promise<string>;
  device(): Promise<DeviceInfo | null>;
  /** Rooted / jailbroken phone (FR-ATT-10): sent with each batch so the server flags its punches for review. */
  rooted?(): Promise<boolean>;
  now?(): Date;
}

export interface SyncOutcome {
  /** Accepted by the server (created or replayed), in send order. */
  accepted: PunchItemResult[];
  rejected: PunchItemResult[];
  /** Stopped because the server could not be reached; everything left stays queued. */
  offline: boolean;
}

const isNetwork = (err: unknown) => err instanceof ApiError && err.code === 'network';
/** A 4xx other than auth: the same payload will never be accepted, so it is not retried. */
const isPermanent = (err: unknown) => err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429;
const codeOf = (err: unknown) => (err instanceof ApiError ? err.code : 'unknown');

/** Everything not delivered on the first attempt is an offline record (FR-ATT-06.1). */
const markOffline = (store: QueueStore, items: readonly QueuedPunch[]) =>
  Promise.all(items.filter((i) => !i.offline).map((i) => store.update(i.clientRef, { offline: true })));

/**
 * Send the pending queue (FR-ATT-05): upload selfies first, then the punches in batches. The server answers
 * each item; accepted ones (created or replayed — idempotent by clientRef) leave the queue, refused ones stay
 * as `rejected` with the error code. A network failure stops the run and keeps the rest for the next one.
 */
export const syncQueue = async (deps: SyncDeps): Promise<SyncOutcome> => {
  const { store } = deps;
  const outcome: SyncOutcome = { accepted: [], rejected: [], offline: false };
  const pending = (await store.list(deps.userId)).filter((p) => p.status === 'pending');
  if (!pending.length) return outcome;
  const device = await deps.device();
  if (!device) return outcome;
  const rooted = (await deps.rooted?.().catch(() => false)) ?? false;

  const ready: QueuedPunch[] = [];
  for (const p of pending) {
    if (!p.selfieUri || p.selfieFileId) {
      ready.push(p);
      continue;
    }
    try {
      const selfieFileId = await deps.uploadSelfie(p.selfieUri);
      await store.update(p.clientRef, { selfieFileId });
      ready.push({ ...p, selfieFileId });
    } catch (err) {
      if (isPermanent(err)) {
        await store.update(p.clientRef, { status: 'rejected', error: codeOf(err) });
        outcome.rejected.push({ clientRef: p.clientRef, result: 'rejected', error: codeOf(err) });
        continue;
      }
      await markOffline(store, pending);
      return { ...outcome, offline: isNetwork(err) };
    }
  }

  for (let i = 0; i < ready.length; i += PUNCH_BATCH_MAX) {
    const chunk = ready.slice(i, i + PUNCH_BATCH_MAX);
    let response: PunchBatchResponse;
    try {
      response = await deps.submit({
        ...device,
        ...(rooted ? { rooted: true } : {}),
        deviceSentAt: (deps.now?.() ?? new Date()).toISOString(),
        items: chunk.map((p) => ({
          clientRef: p.clientRef,
          kind: p.kind,
          capturedAt: p.capturedAt,
          latitude: p.latitude,
          longitude: p.longitude,
          accuracyMetres: p.accuracyMetres,
          mocked: false,
          offline: p.offline,
          ...(p.selfieFileId ? { selfieFileId: p.selfieFileId } : {}),
          ...(p.offsiteReason ? { offsiteReason: p.offsiteReason } : {}),
          ...(p.wifi !== undefined ? { wifi: p.wifi } : {}),
        })),
      });
    } catch (err) {
      if (isPermanent(err)) {
        await Promise.all(chunk.map((p) => store.update(p.clientRef, { status: 'rejected', error: codeOf(err) })));
        outcome.rejected.push(...chunk.map((p): PunchItemResult => ({ clientRef: p.clientRef, result: 'rejected', error: codeOf(err) })));
        continue;
      }
      await markOffline(store, ready.slice(i));
      return { ...outcome, offline: isNetwork(err) };
    }
    const done: string[] = [];
    for (const r of response.results) {
      if (r.result === 'rejected') {
        await store.update(r.clientRef, { status: 'rejected', error: r.error ?? 'unknown' });
        outcome.rejected.push(r);
      } else {
        done.push(r.clientRef);
        outcome.accepted.push(r);
      }
    }
    await store.remove(done);
  }
  return outcome;
};

// ─────────────────────── App-wide queue state ───────────────────────

interface CheckinQueueState {
  items: QueuedPunch[];
  syncing: boolean;
  /** Reload the queue from storage. */
  refresh(): Promise<void>;
}

export const useCheckinQueue = create<CheckinQueueState>((set) => ({
  items: [],
  syncing: false,
  refresh: async () => {
    const userId = useAuthStore.getState().user?.id;
    set({ items: userId ? await (await getQueueStore()).list(userId) : [] });
  },
}));

let running: Promise<SyncOutcome> | null = null;

/** Sync the app's queue once at a time (reconnect, foreground and new punches all call this). */
export const syncNow = (): Promise<SyncOutcome> => {
  running ??= (async () => {
    useCheckinQueue.setState({ syncing: true });
    try {
      const userId = useAuthStore.getState().user?.id;
      if (!userId) return { accepted: [], rejected: [], offline: false };
      const store = await getQueueStore();
      return await syncQueue({ store, userId, submit: checkinApi.submit, uploadSelfie: checkinApi.uploadSelfie, device: getDeviceInfo, rooted: isDeviceRooted });
    } finally {
      await useCheckinQueue.getState().refresh();
      useCheckinQueue.setState({ syncing: false });
      running = null;
    }
  })();
  return running;
};
