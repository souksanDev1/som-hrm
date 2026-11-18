import { z } from 'zod';
import { PunchKind } from '../enums';
import { pinSchema } from './auth';
import { punchItemResultSchema } from './checkin';

/**
 * Kiosk mode (FR-ATT-03, FR-WS-06.3): a shared tablet enrolled by HR for one branch. It is a branch device with
 * its own token (client answer Q2, 2026-11-17), never an employee device binding. Employees punch on it with
 * their employee code + login PIN, and a photo is always taken (FR-ATT-03.3).
 */

/** HTTP auth scheme of kiosk requests: `Authorization: Kiosk <enrol code>`. */
export const KIOSK_AUTH_SCHEME = 'Kiosk';

/** Most punches one kiosk batch may carry (each item verifies a PIN hash, so it is kept small). */
export const KIOSK_PUNCH_BATCH_MAX = 50;

// ───────────────────────────── HR management ─────────────────────────────

export const createKioskSchema = z.object({
  branchId: z.string().min(1, 'required'),
  name: z.string().trim().min(1, 'required').max(100),
});
export type CreateKioskInput = z.input<typeof createKioskSchema>;

export const kioskListQuerySchema = z.object({
  branchId: z.string().min(1).optional(),
  /** Include revoked kiosks (default: active only). */
  includeRevoked: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type KioskListQuery = z.input<typeof kioskListQuerySchema>;

export const kioskDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  enrolledByName: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type KioskDevice = z.infer<typeof kioskDeviceSchema>;

/** The enrol answer: the device plus its one-time enrol code (shown once; only its hash is stored). */
export const kioskEnrolmentSchema = z.object({
  kiosk: kioskDeviceSchema,
  enrolCode: z.string(),
});
export type KioskEnrolment = z.infer<typeof kioskEnrolmentSchema>;

// ───────────────────────────── Kiosk device API ─────────────────────────────

/** What the kiosk app shows and needs (`GET /kiosk/me`). */
export const kioskInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  branch: z.object({ id: z.string(), name: z.string() }),
  workspace: z.object({ name: z.string(), logoUrl: z.string().nullable() }),
  timeZone: z.string(),
  serverTime: z.string(),
  /** Always true on a kiosk (FR-ATT-03.3), whatever `attendance.selfieRequired` says. */
  photoRequired: z.boolean(),
  /** The branch still has KIOSK among its attendance modes (FR-WS-06.3). */
  kioskEnabled: z.boolean(),
  deviceTimeToleranceMinutes: z.number(),
  offlineAlertHours: z.number(),
});
export type KioskInfo = z.infer<typeof kioskInfoSchema>;

const instantSchema = z.string().datetime({ offset: true, message: 'invalid_date' });

/** One punch typed on the kiosk. `kind` omitted = the next one for that employee (IN after OUT / none). */
export const kioskPunchItemSchema = z.object({
  clientRef: z.string().trim().min(8).max(100),
  employeeCode: z.string().trim().min(1, 'required').max(20),
  pin: pinSchema,
  kind: z.nativeEnum(PunchKind).optional(),
  /** Tablet clock at capture (FR-ATT-06). */
  capturedAt: instantSchema,
  /** Photo uploaded by this kiosk (`POST /kiosk/files`); required (FR-ATT-03.3). */
  selfieFileId: z.string().min(1).optional(),
  /** Captured without a connection and synced later (FR-ATT-06.1). */
  offline: z.boolean().default(false),
});
export type KioskPunchItemInput = z.input<typeof kioskPunchItemSchema>;

export const kioskPunchBatchSchema = z.object({
  /** Tablet clock when the batch was sent: compared with the server clock (FR-ATT-07). */
  deviceSentAt: instantSchema,
  items: z.array(kioskPunchItemSchema).min(1).max(KIOSK_PUNCH_BATCH_MAX),
});
export type KioskPunchBatchInput = z.input<typeof kioskPunchBatchSchema>;
export type KioskPunchBatchData = z.output<typeof kioskPunchBatchSchema>;

/** Per-item outcome, like the mobile batch, plus who punched (for the confirmation screen). */
export const kioskPunchItemResultSchema = punchItemResultSchema.extend({
  employee: z.object({ code: z.string(), name: z.string() }).optional(),
});
export type KioskPunchItemResult = z.infer<typeof kioskPunchItemResultSchema>;

export const kioskPunchBatchResponseSchema = z.object({
  serverTime: z.string(),
  results: z.array(kioskPunchItemResultSchema),
});
export type KioskPunchBatchResponse = z.infer<typeof kioskPunchBatchResponseSchema>;

/** `Authorization` header value of a kiosk request. */
export const kioskAuthorization = (token: string) => `${KIOSK_AUTH_SCHEME} ${token}`;

/** The token of a `Kiosk <token>` header, or null. */
export const parseKioskAuthorization = (header: string | undefined | null): string | null => {
  const m = /^Kiosk\s+([A-Za-z0-9_-]{20,200})$/.exec(header?.trim() ?? '');
  return m ? m[1]! : null;
};
