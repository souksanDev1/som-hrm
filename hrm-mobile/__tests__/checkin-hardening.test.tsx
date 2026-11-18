import type { PunchBatchInput, PunchBatchResponse } from '@hrm/shared';
import NetInfo from '@react-native-community/netinfo';
import * as Device from 'expo-device';
import { isDeviceRooted, resetDeviceIntegrityForTests } from '@/features/checkin/integrity';
import { createSqliteQueueStore, fromRow, type QueuedPunch, type QueueStore } from '@/features/checkin/queue';
import { syncQueue } from '@/features/checkin/sync';
import { currentWifi } from '@/features/checkin/wifi';

/** Hardening: rooted-device flag (FR-ATT-10) and office Wi-Fi report (FR-ATT-12) on the phone side. */

const memoryStore = (): QueueStore & { rows: Map<string, QueuedPunch> } => {
  const rows = new Map<string, QueuedPunch>();
  return {
    rows,
    list: async (userId) => [...rows.values()].filter((r) => r.userId === userId),
    add: async (p) => void rows.set(p.clientRef, { ...p }),
    update: async () => undefined,
    remove: async (refs) => refs.forEach((r) => rows.delete(r)),
    getMeta: async () => null,
    setMeta: async () => undefined,
  };
};

const queued = (over: Partial<QueuedPunch> = {}): QueuedPunch => ({
  clientRef: `ref-${Math.random().toString(16).slice(2)}`,
  userId: 'u1',
  kind: 'IN',
  capturedAt: '2026-11-17T01:00:00.000Z',
  latitude: 17.97,
  longitude: 102.63,
  accuracyMetres: 10,
  offline: false,
  offsiteReason: null,
  selfieUri: null,
  selfieFileId: null,
  status: 'pending',
  error: null,
  ...over,
});

const DEVICE = { deviceId: 'dev-1', platform: 'ANDROID' as const };

const sendAll = async (store: QueueStore, rooted?: () => Promise<boolean>) => {
  const submit = jest.fn(async (body: PunchBatchInput): Promise<PunchBatchResponse> => ({
    serverTime: '2026-11-17T01:00:01.000Z',
    results: body.items.map((i) => ({ clientRef: i.clientRef, result: 'rejected' as const, error: 'test' })),
  }));
  await syncQueue({ store, userId: 'u1', submit, uploadSelfie: jest.fn(), device: async () => DEVICE, ...(rooted ? { rooted } : {}) });
  return submit.mock.calls[0]![0];
};

describe('rooted / jailbroken device (FR-ATT-10)', () => {
  beforeEach(() => resetDeviceIntegrityForTests());

  it('reports what expo-device detects, once per session', async () => {
    const check = jest.mocked(Device.isRootedExperimentalAsync);
    check.mockResolvedValueOnce(true);
    expect(await isDeviceRooted()).toBe(true);
    expect(await isDeviceRooted()).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('fails open: an error counts as not rooted', async () => {
    jest.mocked(Device.isRootedExperimentalAsync).mockRejectedValueOnce(new Error('unsupported'));
    expect(await isDeviceRooted()).toBe(false);
  });

  it('sync sends rooted: true with the batch only for a rooted phone, and never fails on the check', async () => {
    const store = memoryStore();
    await store.add(queued());
    expect(await sendAll(store, async () => true)).toMatchObject({ rooted: true });
    expect(await sendAll(store, async () => false)).not.toHaveProperty('rooted');
    expect(await sendAll(store, () => Promise.reject(new Error('boom')))).not.toHaveProperty('rooted');
    expect(await sendAll(store)).not.toHaveProperty('rooted');
  });
});

describe('office Wi-Fi report (FR-ATT-12)', () => {
  const fetch = jest.mocked(NetInfo.fetch);

  it('reads the SSID / BSSID on Wi-Fi, null off Wi-Fi, undefined when it cannot tell', async () => {
    fetch.mockResolvedValueOnce({ type: 'wifi', isConnected: true, details: { ssid: 'SOM-Office', bssid: 'aa:bb:cc:dd:ee:01' } } as never);
    expect(await currentWifi()).toEqual({ ssid: 'SOM-Office', bssid: 'aa:bb:cc:dd:ee:01' });
    fetch.mockResolvedValueOnce({ type: 'wifi', isConnected: true, details: { ssid: null, bssid: null } } as never);
    expect(await currentWifi()).toEqual({ ssid: null, bssid: null });
    fetch.mockResolvedValueOnce({ type: 'cellular', isConnected: true, details: {} } as never);
    expect(await currentWifi()).toBeNull();
    fetch.mockRejectedValueOnce(new Error('native module missing'));
    expect(await currentWifi()).toBeUndefined();
  });

  it('sync sends each punch with the Wi-Fi it was captured on', async () => {
    const store = memoryStore();
    const onWifi = queued({ capturedAt: '2026-11-17T01:00:00.000Z', wifi: { ssid: 'SOM-Office', bssid: null } });
    const offWifi = queued({ capturedAt: '2026-11-17T01:01:00.000Z', wifi: null });
    const unknown = queued({ capturedAt: '2026-11-17T01:02:00.000Z' });
    for (const p of [onWifi, offWifi, unknown]) await store.add(p);
    const body = await sendAll(store);
    expect(body.items[0]).toMatchObject({ wifi: { ssid: 'SOM-Office', bssid: null } });
    expect(body.items[1]).toMatchObject({ wifi: null });
    expect(body.items[2]).not.toHaveProperty('wifi');
  });

  it('keeps the Wi-Fi in the SQLite queue (JSON column; NULL = not read)', async () => {
    const row = {
      client_ref: 'r1', user_id: 'u1', kind: 'IN', captured_at: '2026-11-17T01:00:00.000Z', latitude: 1, longitude: 2, accuracy: 5,
      offline: 0, offsite_reason: null, selfie_uri: null, selfie_file_id: null, status: 'pending', error: null,
    };
    expect(fromRow({ ...row, wifi: '{"ssid":"SOM-Office","bssid":null}' }).wifi).toEqual({ ssid: 'SOM-Office', bssid: null });
    expect(fromRow({ ...row, wifi: 'null' }).wifi).toBeNull();
    expect(fromRow({ ...row, wifi: null })).not.toHaveProperty('wifi');
    expect(fromRow(row)).not.toHaveProperty('wifi');

    const db = { runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })) };
    await createSqliteQueueStore(db as never).add(queued({ clientRef: 'r2', wifi: null }));
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('wifi)'), expect.arrayContaining(['r2', 'null']));
  });
});
