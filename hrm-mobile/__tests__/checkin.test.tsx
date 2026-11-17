import { ApiError, type CheckinStatus, type MyPunch, type PunchBatchInput, type PunchBatchResponse } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';
import { LoginForm } from '@/features/auth/LoginForm';
import { useAuthStore } from '@/features/auth/store';
import { CheckinScreen } from '@/features/checkin/CheckinScreen';
import { getDeviceInfo, resetDeviceInfoForTests } from '@/features/checkin/device';
import { alertIfOverdue } from '@/features/checkin/hooks';
import { createSqliteQueueStore, setQueueStoreForTests, type QueuedPunch, type QueueStore } from '@/features/checkin/queue';
import { syncQueue, useCheckinQueue } from '@/features/checkin/sync';
import { canPunch, nextKindFor, zoneState } from '@/features/checkin/zone';
import { usePrefsStore } from '@/lib/i18n';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect: useMountEffect } = jest.requireActual('react');
    useMountEffect(cb, [cb]);
  },
}));

/** In-memory QueueStore with the same contract as the SQLite one. */
const memoryStore = (): QueueStore & { rows: Map<string, QueuedPunch>; meta: Map<string, string> } => {
  const rows = new Map<string, QueuedPunch>();
  const meta = new Map<string, string>();
  return {
    rows,
    meta,
    list: async (userId) => [...rows.values()].filter((r) => r.userId === userId).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
    add: async (p) => void (rows.has(p.clientRef) || rows.set(p.clientRef, { ...p })),
    update: async (ref, patch) => {
      const row = rows.get(ref);
      if (row) rows.set(ref, { ...row, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) });
    },
    remove: async (refs) => refs.forEach((r) => rows.delete(r)),
    getMeta: async (k) => meta.get(k) ?? null,
    setMeta: async (k, v) => void meta.set(k, v),
  };
};

const queued = (over: Partial<QueuedPunch> = {}): QueuedPunch => ({
  clientRef: `ref-${Math.random().toString(16).slice(2)}`,
  userId: 'u1',
  kind: 'IN',
  capturedAt: '2026-11-17T01:00:00.000Z',
  latitude: 15.1202,
  longitude: 105.7987,
  accuracyMetres: 10,
  offline: false,
  offsiteReason: null,
  selfieUri: null,
  selfieFileId: null,
  status: 'pending',
  error: null,
  ...over,
});

const punchOf = (clientRef: string, over: Partial<MyPunch> = {}): MyPunch => ({
  id: `p-${clientRef}`,
  clientRef,
  kind: 'IN',
  workDate: '2026-11-17',
  capturedAt: '2026-11-17T01:00:00.000Z',
  receivedAt: '2026-11-17T01:00:02.000Z',
  source: 'MOBILE',
  offline: false,
  offsite: false,
  offsiteReason: null,
  distanceMetres: 12,
  accuracyMetres: 10,
  suspicious: false,
  suspiciousReasons: [],
  reviewStatus: 'NONE',
  ...over,
});

const DEVICE = { deviceId: 'dev-1', platform: 'ANDROID' as const };

const status = (over: Partial<CheckinStatus> = {}): CheckinStatus => ({
  serverTime: '2026-11-17T01:00:00.000Z',
  workDate: '2026-11-17',
  timeZone: 'Asia/Vientiane',
  shift: { name: 'Day', startTime: '08:00', endTime: '17:00', scheduledStart: '2026-11-17T01:00:00.000Z', scheduledEnd: '2026-11-17T10:00:00.000Z' },
  branch: { id: 'b1', name: 'ໜ້າງານ ປາກເຊ', latitude: 15.1202, longitude: 105.7987, geofenceRadius: 300, attendanceModes: ['MOBILE'] },
  mobileEnabled: true,
  selfieRequired: false,
  maxAccuracyMetres: 100,
  offlineAlertHours: 72,
  deviceTimeToleranceMinutes: 5,
  device: null,
  offsitePermission: null,
  lastPunch: null,
  nextKind: 'IN',
  day: null,
  ...over,
});

beforeEach(() => {
  usePrefsStore.setState({ locale: 'lo' });
  jest.restoreAllMocks();
});

describe('syncQueue (offline queue, FR-ATT-05/06)', () => {
  it('uploads selfies first, sends the batch and drops accepted punches; refused ones stay as rejected', async () => {
    const store = memoryStore();
    const a = queued({ selfieUri: 'file:///selfie.jpg' });
    const b = queued({ kind: 'OUT', capturedAt: '2026-11-17T10:00:00.000Z' });
    const other = queued({ userId: 'u2' });
    await Promise.all([a, b, other].map((p) => store.add(p)));
    const submit = jest.fn(async (body: PunchBatchInput): Promise<PunchBatchResponse> => ({
      serverTime: '2026-11-17T10:00:01.000Z',
      results: [
        { clientRef: body.items[0]!.clientRef, result: 'created', punch: punchOf(a.clientRef) },
        { clientRef: body.items[1]!.clientRef, result: 'rejected', error: 'attendance_outside_zone', distanceMetres: 900 },
      ],
    }));
    const uploadSelfie = jest.fn(async () => 'file-1');

    const out = await syncQueue({ store, userId: 'u1', submit, uploadSelfie, device: async () => DEVICE, now: () => new Date('2026-11-17T10:00:00.000Z') });

    expect(uploadSelfie).toHaveBeenCalledWith('file:///selfie.jpg');
    const body = submit.mock.calls[0]![0];
    expect(body).toMatchObject({ deviceId: 'dev-1', platform: 'ANDROID', deviceSentAt: '2026-11-17T10:00:00.000Z' });
    expect(body.items.map((i) => i.clientRef)).toEqual([a.clientRef, b.clientRef]); // never another user's punch
    expect(body.items[0]).toMatchObject({ selfieFileId: 'file-1', mocked: false });
    expect(out.accepted.map((r) => r.clientRef)).toEqual([a.clientRef]);
    expect(store.rows.has(a.clientRef)).toBe(false);
    expect(store.rows.get(b.clientRef)).toMatchObject({ status: 'rejected', error: 'attendance_outside_zone' });
    expect(store.rows.has(other.clientRef)).toBe(true);
  });

  it('keeps everything on a network failure and marks it as an offline record', async () => {
    const store = memoryStore();
    const a = queued();
    await store.add(a);
    const submit = jest.fn(async () => {
      throw new ApiError(0, 'network', 'Network error');
    });
    const out = await syncQueue({ store, userId: 'u1', submit, uploadSelfie: jest.fn(), device: async () => DEVICE });
    expect(out).toMatchObject({ offline: true, accepted: [], rejected: [] });
    expect(store.rows.get(a.clientRef)).toMatchObject({ status: 'pending', offline: true });

    // Back online: the same clientRef is sent again (idempotent on the server) and leaves the queue.
    submit.mockImplementation(async () => ({ serverTime: '', results: [{ clientRef: a.clientRef, result: 'replayed', punch: punchOf(a.clientRef, { offline: true }) }] }) as never);
    const again = await syncQueue({ store, userId: 'u1', submit, uploadSelfie: jest.fn(), device: async () => DEVICE });
    expect(again.accepted).toHaveLength(1);
    expect((submit.mock.calls[1] as unknown as [PunchBatchInput])[0].items[0]).toMatchObject({ clientRef: a.clientRef, offline: true });
    expect(store.rows.size).toBe(0);
  });

  it('marks a batch the API refuses as invalid (4xx) as rejected instead of retrying forever', async () => {
    const store = memoryStore();
    const a = queued();
    await store.add(a);
    const submit = jest.fn(async () => {
      throw new ApiError(400, 'validation_error', 'bad');
    });
    const out = await syncQueue({ store, userId: 'u1', submit, uploadSelfie: jest.fn(), device: async () => DEVICE });
    expect(out.rejected).toHaveLength(1);
    expect(store.rows.get(a.clientRef)).toMatchObject({ status: 'rejected', error: 'validation_error' });
  });

  it('does nothing without pending punches or a device identity', async () => {
    const store = memoryStore();
    const submit = jest.fn();
    expect(await syncQueue({ store, userId: 'u1', submit, uploadSelfie: jest.fn(), device: async () => DEVICE })).toEqual({ accepted: [], rejected: [], offline: false });
    await store.add(queued());
    await syncQueue({ store, userId: 'u1', submit, uploadSelfie: jest.fn(), device: async () => null });
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('SQLite queue store', () => {
  it('maps rows and binds parameters', async () => {
    const db = {
      runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
      getAllAsync: jest.fn(async () => [
        {
          client_ref: 'r1', user_id: 'u1', kind: 'OUT', captured_at: '2026-11-17T10:00:00.000Z', latitude: 1, longitude: 2, accuracy: 5,
          offline: 1, offsite_reason: 'Visit', selfie_uri: null, selfie_file_id: 'f1', status: 'rejected', error: 'device_not_bound',
        },
      ]),
      getFirstAsync: jest.fn(async () => ({ value: '72' })),
    };
    const store = createSqliteQueueStore(db as never);
    expect(await store.list('u1')).toEqual([
      {
        clientRef: 'r1', userId: 'u1', kind: 'OUT', capturedAt: '2026-11-17T10:00:00.000Z', latitude: 1, longitude: 2, accuracyMetres: 5,
        offline: true, offsiteReason: 'Visit', selfieUri: null, selfieFileId: 'f1', status: 'rejected', error: 'device_not_bound',
      },
    ]);
    expect(db.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = ?'), ['u1']);
    await store.update('r1', { offline: true, error: null });
    expect(db.runAsync).toHaveBeenLastCalledWith('UPDATE punch_queue SET offline = ?, error = ? WHERE client_ref = ?', [1, null, 'r1']);
    await store.remove(['r1', 'r2']);
    expect(db.runAsync).toHaveBeenLastCalledWith('DELETE FROM punch_queue WHERE client_ref IN (?, ?)', ['r1', 'r2']);
    expect(await store.getMeta('x')).toBe('72');
  });
});

describe('zone state (FR-ATT-09/15/16)', () => {
  const at = (latitude: number, longitude: number, over: Partial<{ accuracyMetres: number; mocked: boolean }> = {}) => ({
    kind: 'ok' as const,
    fix: { latitude, longitude, accuracyMetres: over.accuracyMetres ?? 10, mocked: over.mocked ?? false, at: Date.now() },
  });

  it('derives every screen state with the shared geofence check', () => {
    expect(zoneState(status(), at(15.1203, 105.7987))).toMatchObject({ kind: 'inside' });
    expect(zoneState(status(), at(15.13, 105.7987))).toMatchObject({ kind: 'outside' });
    expect((zoneState(status(), at(15.13, 105.7987)) as { distanceMetres: number }).distanceMetres).toBeGreaterThan(1000);
    expect(zoneState(status({ offsitePermission: { id: 'o', fromDate: '2026-11-17', toDate: '2026-11-17', note: null } }), at(15.13, 105.7987))).toMatchObject({ kind: 'outsideOffsite' });
    expect(zoneState(status(), at(15.1203, 105.7987, { accuracyMetres: 400 }))).toEqual({ kind: 'lowAccuracy', accuracyMetres: 400 });
    expect(zoneState(status(), at(15.1203, 105.7987, { mocked: true }))).toEqual({ kind: 'mocked' });
    expect(zoneState(status({ mobileEnabled: false }), at(15.1203, 105.7987))).toEqual({ kind: 'disabled' });
    expect(zoneState(status(), { kind: 'off' })).toEqual({ kind: 'off' });
    expect(zoneState(null, at(1, 1))).toEqual({ kind: 'unknown' });
    expect(canPunch({ kind: 'outside', distanceMetres: 900 })).toBe(false);
    expect(canPunch({ kind: 'unknown' })).toBe(true);
  });

  it('offers OUT after an unsent IN of today', () => {
    const now = new Date('2026-11-17T05:00:00.000Z');
    expect(nextKindFor(status(), [], now)).toBe('IN');
    expect(nextKindFor(status(), [queued({ kind: 'IN' })], now)).toBe('OUT');
    expect(nextKindFor(status({ nextKind: 'OUT' }), [], now)).toBe('OUT');
    expect(nextKindFor(null, [queued({ kind: 'IN', capturedAt: '2026-11-10T01:00:00.000Z' })], now)).toBe('IN');
  });
});

describe('offline alert (FR-ATT-08, FR-NOTI-03.7)', () => {
  it('raises one local notification per oldest unsent punch once it is older than offlineAlertHours', async () => {
    const store = memoryStore();
    setQueueStoreForTests(store);
    await store.setMeta('status', JSON.stringify(status({ offlineAlertHours: 24 })));
    await store.add(queued({ clientRef: 'old', capturedAt: '2026-11-15T00:00:00.000Z' }));
    const schedule = jest.spyOn(Notifications, 'scheduleNotificationAsync');

    expect(await alertIfOverdue('u1', 'lo', new Date('2026-11-15T12:00:00.000Z'))).toBe(false);
    expect(await alertIfOverdue('u1', 'lo', new Date('2026-11-16T01:00:00.000Z'))).toBe(true);
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ title: 'ຂໍ້ມູນລົງເວລາຍັງບໍ່ໄດ້ສົ່ງ', body: expect.stringContaining('1 ລາຍການ') }), trigger: null }),
    );
    expect(await alertIfOverdue('u1', 'lo', new Date('2026-11-16T02:00:00.000Z'))).toBe(false);
    setQueueStoreForTests(null);
  });
});

describe('CheckinScreen', () => {
  const json = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}>{children}</QueryClientProvider>
  );
  let store: ReturnType<typeof memoryStore>;
  const fixAt = (latitude: number, longitude: number, mocked = false) =>
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({ coords: { latitude, longitude, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now(), mocked });

  /** Route the API by path; `punches` answers POST /attendance/punches. */
  const api = (s: CheckinStatus, punches?: (body: PunchBatchInput) => Response) =>
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const path = String(url);
      if (path.includes('/attendance/me/status')) return json(s);
      if (path.includes('/attendance/punches/me')) return json([]);
      if (path.endsWith('/attendance/punches') && punches) return punches(JSON.parse(String(init!.body)) as PunchBatchInput);
      return json({ error: { code: 'not_found', message: '' } }, 404);
    });

  beforeEach(() => {
    store = memoryStore();
    setQueueStoreForTests(store);
    useCheckinQueue.setState({ items: [], syncing: false });
    useAuthStore.setState({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1', employeeId: 'e1' } as never });
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ granted: true, status: 'granted' } as never);
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);
  });
  afterEach(() => setQueueStoreForTests(null));

  it('shows the branch, live distance inside the zone, and records a check-in', async () => {
    fixAt(15.1203, 105.7987);
    const fetchSpy = api(status(), (body) =>
      json({ serverTime: '', results: [{ clientRef: body.items[0]!.clientRef, result: 'created', punch: punchOf(body.items[0]!.clientRef, { capturedAt: '2026-11-17T01:02:00.000Z' }) }] }),
    );
    render(<CheckinScreen />, { wrapper });
    expect(await screen.findByTestId('checkin-zone-inside')).toBeTruthy();
    expect(screen.getByTestId('checkin-branch')).toHaveTextContent('ໜ້າງານ ປາກເຊ');
    expect(screen.getByTestId('checkin-shift')).toHaveTextContent('ກະວຽກ 08:00–17:00');
    expect(screen.getByTestId('checkin-distance')).toHaveTextContent(/ຫ່າງຈາກສາຂາ 11 ແມັດ/);
    expect(screen.getByTestId('checkin-button-label')).toHaveTextContent('ລົງເວລາເຂົ້າ');

    fireEvent.press(screen.getByTestId('checkin-button'));
    expect(await screen.findByTestId('checkin-message')).toHaveTextContent('ເຂົ້າວຽກ ສຳເລັດ ເວລາ 08:02');
    const post = fetchSpy.mock.calls.find(([u, i]) => String(u).endsWith('/attendance/punches') && i?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ deviceId: expect.stringMatching(/^test-/), items: [{ kind: 'IN', latitude: 15.1203, mocked: false, offline: false }] });
    expect(store.rows.size).toBe(0);
  });

  it('blocks outside the zone with the distance', async () => {
    fixAt(15.13, 105.7987);
    api(status());
    render(<CheckinScreen />, { wrapper });
    expect(await screen.findByTestId('checkin-zone-outside')).toBeTruthy();
    expect(screen.getByTestId('checkin-zone-message')).toHaveTextContent(/ຢູ່ນອກເຂດລົງເວລາ — ຫ່າງ \d+ ແມັດ/);
    expect(screen.getByTestId('checkin-button')).toBeDisabled();
  });

  it('blocks a mock location (FR-ATT-09)', async () => {
    fixAt(15.1203, 105.7987, true);
    api(status());
    render(<CheckinScreen />, { wrapper });
    expect(await screen.findByTestId('checkin-zone-mocked')).toBeTruthy();
    expect(screen.getByTestId('checkin-button')).toBeDisabled();
  });

  it('shows GPS off and permission denied', async () => {
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(false);
    api(status());
    const { unmount } = render(<CheckinScreen />, { wrapper });
    expect(await screen.findByTestId('checkin-zone-off')).toBeTruthy();
    unmount();
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ granted: false, status: 'denied' } as never);
    render(<CheckinScreen />, { wrapper });
    expect(await screen.findByTestId('checkin-zone-denied')).toBeTruthy();
  });

  it('asks for a reason when checking in off-site under a permission (FR-ATT-16.2)', async () => {
    fixAt(15.13, 105.7987);
    const fetchSpy = api(status({ offsitePermission: { id: 'o1', fromDate: '2026-11-17', toDate: '2026-11-17', note: null } }), (body) =>
      json({ serverTime: '', results: [{ clientRef: body.items[0]!.clientRef, result: 'created', punch: punchOf(body.items[0]!.clientRef, { offsite: true, reviewStatus: 'PENDING' }) }] }),
    );
    render(<CheckinScreen />, { wrapper });
    expect(await screen.findByTestId('checkin-zone-outsideOffsite')).toBeTruthy();
    expect(screen.getByTestId('checkin-offsite-permission')).toHaveTextContent(/2026-11-17 – 2026-11-17/);
    fireEvent.press(screen.getByTestId('checkin-button'));
    fireEvent.changeText(await screen.findByTestId('offsite-reason-input'), 'Client meeting');
    fireEvent.press(screen.getByTestId('offsite-submit'));
    expect(await screen.findByTestId('checkin-message')).toHaveTextContent(/ລໍຫົວໜ້າ\/HR ກວດສອບ/);
    const post = fetchSpy.mock.calls.find(([u, i]) => String(u).endsWith('/attendance/punches') && i?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body)).items[0]).toMatchObject({ offsiteReason: 'Client meeting' });
  });

  it('queues the punch when the server cannot be reached and shows it as waiting to sync', async () => {
    fixAt(15.1203, 105.7987);
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/attendance/me/status')) return json(status());
      if (String(url).includes('/attendance/punches/me')) return json([]);
      throw new TypeError('Network request failed');
    });
    render(<CheckinScreen />, { wrapper });
    await screen.findByTestId('checkin-zone-inside');
    fireEvent.press(screen.getByTestId('checkin-button'));
    expect(await screen.findByTestId('checkin-message')).toHaveTextContent(/ບັນທຶກໄວ້ໃນເຄື່ອງແລ້ວ/);
    expect(screen.getByTestId('checkin-pending')).toHaveTextContent(/ລໍສົ່ງ 1 ລາຍການ/);
    const [row] = [...store.rows.values()];
    expect(row).toMatchObject({ userId: 'u1', kind: 'IN', status: 'pending', offline: true });
    expect(screen.getByTestId(`checkin-queued-${row!.clientRef}`)).toHaveTextContent(/ລໍສົ່ງ/);
    // The next punch offered is OUT even though the server has not seen the IN yet.
    expect(screen.getByTestId('checkin-button-label')).toHaveTextContent('ລົງເວລາອອກ');
  });

  it('shows the overdue banner and offline records with their received time (FR-ATT-06/08)', async () => {
    fixAt(15.1203, 105.7987);
    await store.add(queued({ capturedAt: '2026-01-01T00:00:00.000Z' }));
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/attendance/me/status')) return json(status());
      if (String(url).includes('/attendance/punches/me')) return json([punchOf('x', { offline: true, receivedAt: '2026-11-17T03:30:00.000Z' })]);
      return json({}, 500);
    });
    render(<CheckinScreen />, { wrapper });
    expect(await screen.findByTestId('checkin-offline-overdue')).toHaveTextContent(/ມີ 1 ລາຍການລົງເວລາໃນເຄື່ອງທີ່ຍັງບໍ່ໄດ້ສົ່ງ/);
    expect(await screen.findByTestId('checkin-offline-p-x')).toHaveTextContent(/ບັນທຶກ offline/);
    expect(screen.getByTestId('checkin-received-p-x')).toHaveTextContent(/ສົ່ງເຖິງເຊີບເວີ 2026-11-17 10:30/);
  });

  it('explains when the account has no employee record', () => {
    useAuthStore.setState({ user: { id: 'u1', employeeId: null } as never });
    render(<CheckinScreen />, { wrapper });
    expect(screen.getByTestId('checkin-no-employee')).toBeTruthy();
  });
});

describe('device identity', () => {
  it('generates the id once per install under the shared SecureStore key and reuses it', async () => {
    const SecureStore = jest.requireMock<{ getItemAsync: jest.Mock; setItemAsync: jest.Mock; deleteItemAsync: jest.Mock }>('expo-secure-store');
    await SecureStore.deleteItemAsync('hrm.attendance.deviceId');
    resetDeviceInfoForTests();
    const first = await getDeviceInfo();
    expect(first?.deviceId).toMatch(/^test-/);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('hrm.attendance.deviceId', first!.deviceId);
    await SecureStore.setItemAsync('hrm.attendance.deviceId', 'kept-id');
    resetDeviceInfoForTests();
    expect((await getDeviceInfo())?.deviceId).toBe('kept-id');
    await SecureStore.deleteItemAsync('hrm.attendance.deviceId');
    resetDeviceInfoForTests();
  });
});

describe('mobile login binds the phone (FR-ATT-11.1)', () => {
  it('sends the device identity with the PIN login', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
    const loginResponse = {
      accessToken: 'a', refreshToken: 'r', expiresIn: 900,
      user: { id: 'u', workspaceId: 'w', workspaceName: 'SOM', displayName: 'ຄຳແພງ', email: null, roles: ['EMPLOYEE'], permissions: [], employeeId: 'e', mustChangeCredential: false, locale: 'lo' },
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(loginResponse), { status: 200 }));
    const onSuccess = jest.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
    );
    render(<LoginForm onSuccess={onSuccess} />, { wrapper });
    fireEvent.changeText(screen.getByTestId('input-workspace'), 'som-demo');
    fireEvent.changeText(screen.getByTestId('input-identifier'), '02055550003');
    fireEvent.changeText(screen.getByTestId('input-pin'), '482913');
    fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body));
    expect(body).toMatchObject({ pin: '482913', deviceId: expect.stringMatching(/^test-/), platform: expect.stringMatching(/^(IOS|ANDROID)$/) });
  });
});

