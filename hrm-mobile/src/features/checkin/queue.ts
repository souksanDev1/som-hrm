import type { PunchKind } from '@hrm/shared';
import * as SQLite from 'expo-sqlite';

/**
 * Offline punch queue (FR-ATT-05/06): every punch is stored on the phone first, with its own idempotency key
 * (`clientRef`) and capture time, then sent by the sync. A punch the server refused stays visible as
 * `rejected` until the user dismisses it.
 */
export interface QueuedPunch {
  clientRef: string;
  /** Signed-in user who punched: only their own session sends it (a shared phone never mixes people). */
  userId: string;
  kind: PunchKind;
  /** Device clock at capture (ISO). */
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMetres: number | null;
  /** Not delivered on the first attempt: shown as an offline record. */
  offline: boolean;
  offsiteReason: string | null;
  /** Local photo, uploaded at sync time. */
  selfieUri: string | null;
  selfieFileId: string | null;
  status: 'pending' | 'rejected';
  error: string | null;
  /** Kiosk queue only (FR-ATT-03.2): the employee code typed on the tablet. */
  employeeCode?: string | null;
}

export type QueuePatch = Partial<Pick<QueuedPunch, 'offline' | 'selfieFileId' | 'status' | 'error'>>;

export interface QueueStore {
  /** Queued punches of one user, oldest capture first. */
  list(userId: string): Promise<QueuedPunch[]>;
  add(punch: QueuedPunch): Promise<void>;
  update(clientRef: string, patch: QueuePatch): Promise<void>;
  remove(clientRefs: readonly string[]): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

interface Row {
  client_ref: string;
  user_id: string;
  kind: string;
  captured_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  offline: number;
  offsite_reason: string | null;
  selfie_uri: string | null;
  selfie_file_id: string | null;
  status: string;
  error: string | null;
  employee_code?: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS punch_queue (
  client_ref TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  accuracy REAL,
  offline INTEGER NOT NULL DEFAULT 0,
  offsite_reason TEXT,
  selfie_uri TEXT,
  selfie_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  employee_code TEXT
);
CREATE TABLE IF NOT EXISTS checkin_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
`;

const COLUMN: Record<keyof QueuePatch, string> = { offline: 'offline', selfieFileId: 'selfie_file_id', status: 'status', error: 'error' };

export const fromRow = (r: Row): QueuedPunch => ({
  clientRef: r.client_ref,
  userId: r.user_id,
  kind: r.kind as PunchKind,
  capturedAt: r.captured_at,
  latitude: r.latitude,
  longitude: r.longitude,
  accuracyMetres: r.accuracy,
  offline: r.offline === 1,
  offsiteReason: r.offsite_reason,
  selfieUri: r.selfie_uri,
  selfieFileId: r.selfie_file_id,
  status: r.status === 'rejected' ? 'rejected' : 'pending',
  error: r.error,
  ...(r.employee_code ? { employeeCode: r.employee_code } : {}),
});

/** expo-sqlite implementation (the database survives app restarts and phone reboots). */
export const createSqliteQueueStore = (db: SQLite.SQLiteDatabase): QueueStore => ({
  list: async (userId) => (await db.getAllAsync<Row>('SELECT * FROM punch_queue WHERE user_id = ? ORDER BY captured_at ASC', [userId])).map(fromRow),
  add: async (p) => {
    await db.runAsync(
      `INSERT OR IGNORE INTO punch_queue (client_ref, user_id, kind, captured_at, latitude, longitude, accuracy, offline, offsite_reason, selfie_uri, selfie_file_id, status, error, employee_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.clientRef, p.userId, p.kind, p.capturedAt, p.latitude, p.longitude, p.accuracyMetres, p.offline ? 1 : 0, p.offsiteReason, p.selfieUri, p.selfieFileId, p.status, p.error, p.employeeCode ?? null],
    );
  },
  update: async (clientRef, patch) => {
    const entries = (Object.keys(patch) as (keyof QueuePatch)[]).filter((k) => patch[k] !== undefined);
    if (!entries.length) return;
    const values = entries.map((k) => (typeof patch[k] === 'boolean' ? (patch[k] ? 1 : 0) : (patch[k] as string | null)));
    await db.runAsync(`UPDATE punch_queue SET ${entries.map((k) => `${COLUMN[k]} = ?`).join(', ')} WHERE client_ref = ?`, [...values, clientRef]);
  },
  remove: async (clientRefs) => {
    if (!clientRefs.length) return;
    await db.runAsync(`DELETE FROM punch_queue WHERE client_ref IN (${clientRefs.map(() => '?').join(', ')})`, [...clientRefs]);
  },
  getMeta: async (key) => (await db.getFirstAsync<{ value: string }>('SELECT value FROM checkin_meta WHERE key = ?', [key]))?.value ?? null,
  setMeta: async (key, value) => {
    await db.runAsync('INSERT OR REPLACE INTO checkin_meta (key, value) VALUES (?, ?)', [key, value]);
  },
});

/**
 * Open (and migrate) a queue database. The phone app uses `hrm-checkin.db`; the kiosk variant its own file, keyed
 * by kiosk instead of user (FR-ATT-03).
 */
export const openQueueStore = async (fileName: string): Promise<QueueStore> => {
  const db = await SQLite.openDatabaseAsync(fileName);
  await db.execAsync(SCHEMA);
  // Queues created before the kiosk column existed (M5-C installs).
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(punch_queue)');
  if (!columns.some((c) => c.name === 'employee_code')) await db.execAsync('ALTER TABLE punch_queue ADD COLUMN employee_code TEXT');
  return createSqliteQueueStore(db);
};

let storePromise: Promise<QueueStore> | null = null;

/** The app's queue (opened once). */
export const getQueueStore = (): Promise<QueueStore> => {
  storePromise ??= openQueueStore('hrm-checkin.db');
  return storePromise;
};

/** Test hook: use another store (e.g. in memory). */
export const setQueueStoreForTests = (store: QueueStore | null) => {
  storePromise = store ? Promise.resolve(store) : null;
};
