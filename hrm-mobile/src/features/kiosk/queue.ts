import { KIOSK_PUNCH_BATCH_MAX, type KioskPunchBatchInput, type KioskPunchBatchResponse, type KioskPunchItemResult } from '@hrm/shared';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { newId } from '@/features/checkin/device';
import { openQueueStore, type QueueStore } from '@/features/checkin/queue';
import { syncPunchQueue, type SyncOutcome } from '@/features/checkin/sync';
import { kioskApi } from './api';
import { kioskQueueOwner, useKioskStore } from './store';

/**
 * Kiosk offline queue (FR-ATT-03 + FR-ATT-05/06): the phone app's punch queue and sync, keyed by kiosk instead of
 * user. The PIN of a waiting punch is kept in SecureStore (never in SQLite) and deleted once the server answered.
 */
const pinKey = (clientRef: string) => `hrm.kiosk.pin.${clientRef}`;

let storePromise: Promise<QueueStore> | null = null;

export const getKioskQueueStore = (): Promise<QueueStore> => {
  storePromise ??= openQueueStore('hrm-kiosk.db');
  return storePromise;
};

/** Test hook: use another store (e.g. in memory). */
export const setKioskQueueStoreForTests = (store: QueueStore | null) => {
  storePromise = store ? Promise.resolve(store) : null;
};

export interface KioskPunchDraft {
  employeeCode: string;
  pin: string;
  photoUri: string;
  /** Tablet clock at capture (ISO). */
  capturedAt: string;
}

/** Store a punch on the tablet first (it survives restarts and lost connections); returns its clientRef. */
export const enqueueKioskPunch = async (store: QueueStore, ownerId: string, draft: KioskPunchDraft): Promise<string> => {
  const clientRef = newId();
  await SecureStore.setItemAsync(pinKey(clientRef), draft.pin);
  await store.add({
    clientRef,
    userId: ownerId,
    // IN/OUT is decided by the server from the employee's punches (kind omitted); the column only needs a value.
    kind: 'IN',
    capturedAt: draft.capturedAt,
    latitude: null,
    longitude: null,
    accuracyMetres: null,
    offline: false,
    offsiteReason: null,
    selfieUri: draft.photoUri,
    selfieFileId: null,
    status: 'pending',
    error: null,
    employeeCode: draft.employeeCode,
  });
  return clientRef;
};

export interface KioskSyncDeps {
  store: QueueStore;
  ownerId: string;
  submit(body: KioskPunchBatchInput): Promise<KioskPunchBatchResponse>;
  uploadPhoto(uri: string): Promise<string>;
  now?(): Date;
}

/**
 * Send the kiosk queue. Every answered punch (accepted or refused) leaves the tablet with its PIN: nobody at a
 * shared kiosk can fix a refused one, so the refusal is only shown on the confirmation screen.
 */
export const syncKioskQueue = async (deps: KioskSyncDeps): Promise<SyncOutcome<KioskPunchItemResult>> => {
  const outcome = await syncPunchQueue<KioskPunchItemResult>({
    store: deps.store,
    ownerId: deps.ownerId,
    uploadSelfie: deps.uploadPhoto,
    batchMax: KIOSK_PUNCH_BATCH_MAX,
    now: deps.now,
    sendBatch: async (chunk, deviceSentAt) => {
      const items: KioskPunchBatchInput['items'] = [];
      const missing: KioskPunchItemResult[] = [];
      for (const p of chunk) {
        const pin = await SecureStore.getItemAsync(pinKey(p.clientRef));
        if (!pin || !p.employeeCode) {
          missing.push({ clientRef: p.clientRef, result: 'rejected', error: 'kiosk_invalid_credentials' });
          continue;
        }
        items.push({ clientRef: p.clientRef, employeeCode: p.employeeCode, pin, capturedAt: p.capturedAt, offline: p.offline, ...(p.selfieFileId ? { selfieFileId: p.selfieFileId } : {}) });
      }
      const response = items.length ? await deps.submit({ deviceSentAt, items }) : { results: [] };
      return { results: [...response.results, ...missing] };
    },
  });
  const answered = [...outcome.accepted, ...outcome.rejected].map((r) => r.clientRef);
  await Promise.all(answered.map((ref) => SecureStore.deleteItemAsync(pinKey(ref))));
  await deps.store.remove(outcome.rejected.map((r) => r.clientRef));
  return outcome;
};

// ─────────────────────── Tablet-wide queue state ───────────────────────

interface KioskQueueState {
  pending: number;
  refresh(): Promise<void>;
}

const ownerId = () => {
  const info = useKioskStore.getState().info;
  return info ? kioskQueueOwner(info) : null;
};

export const useKioskQueue = create<KioskQueueState>((set) => ({
  pending: 0,
  refresh: async () => {
    const owner = ownerId();
    set({ pending: owner ? (await (await getKioskQueueStore()).list(owner)).filter((p) => p.status === 'pending').length : 0 });
  },
}));

let running: Promise<SyncOutcome<KioskPunchItemResult>> | null = null;

/** Sync the tablet's queue once at a time (new punch, reconnect, foreground, timer). */
export const syncKioskNow = (): Promise<SyncOutcome<KioskPunchItemResult>> => {
  running ??= (async () => {
    try {
      const owner = ownerId();
      if (!owner || !useKioskStore.getState().token) return { accepted: [], rejected: [], offline: false };
      return await syncKioskQueue({ store: await getKioskQueueStore(), ownerId: owner, submit: kioskApi.submit, uploadPhoto: kioskApi.uploadPhoto });
    } finally {
      await useKioskQueue.getState().refresh();
      running = null;
    }
  })();
  return running;
};
