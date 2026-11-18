import { z } from 'zod';
import { AttendanceMode, AttendanceStatus, PunchKind, PunchReviewStatus } from '../enums';

/**
 * Mobile check-in (FR-ATT-01/05–09/11.1/15/16.2): device binding, the offline-queue batch upload and the
 * screens' status payloads. The API is authoritative; the app only shows these results.
 */

/** Phone platforms that can hold an attendance device binding (FR-ATT-11.1). */
export const DEVICE_PLATFORMS = ['IOS', 'ANDROID'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/** Identity of the phone, sent with the mobile login and each punch batch. */
export const deviceInfoSchema = z.object({
  /** Stable per-install id (Android ID / iOS identifierForVendor). */
  deviceId: z.string().trim().min(4, 'required').max(200),
  platform: z.enum(DEVICE_PLATFORMS),
  model: z.string().trim().max(120).optional(),
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

const instantSchema = z.string().datetime({ offset: true, message: 'invalid_date' });

/** Wi-Fi the phone was connected to at capture (FR-ATT-12); `null` fields = not readable on this phone. */
export const wifiObservationSchema = z.object({
  ssid: z.string().max(64).nullable(),
  bssid: z.string().max(32).nullable(),
});
export type WifiObservation = z.infer<typeof wifiObservationSchema>;

/** One queued punch. `clientRef` is the device-generated idempotency key (FR-ATT-05.2). */
export const punchItemSchema = z.object({
  clientRef: z.string().trim().min(8).max(100),
  kind: z.nativeEnum(PunchKind),
  /** Device clock at capture (FR-ATT-06). */
  capturedAt: instantSchema,
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  accuracyMetres: z.number().finite().min(0).nullable(),
  /** The OS reported a mock/fake location (FR-ATT-09). */
  mocked: z.boolean().default(false),
  /** Captured without a connection and synced later (FR-ATT-06.1). */
  offline: z.boolean().default(false),
  /** A SELFIE file uploaded by the caller (`POST /files?purpose=SELFIE`). */
  selfieFileId: z.string().min(1).optional(),
  /** Reason for an out-of-zone punch under an off-site permission (FR-ATT-16.2). */
  offsiteReason: z.string().trim().max(500).optional(),
  /** Wi-Fi at capture (FR-ATT-12); `null` = not on Wi-Fi; omitted = not reported (both count as "not on a listed network"). */
  wifi: wifiObservationSchema.nullable().optional(),
});
export type PunchItemInput = z.input<typeof punchItemSchema>;

export const PUNCH_BATCH_MAX = 100;

export const punchBatchSchema = deviceInfoSchema.extend({
  /** Device clock when the batch was sent: compared with the server clock (FR-ATT-07). */
  deviceSentAt: instantSchema,
  /** Rooted / jailbroken device (SHOULD, FR-ATT-10). */
  rooted: z.boolean().optional(),
  items: z.array(punchItemSchema).min(1).max(PUNCH_BATCH_MAX),
});
export type PunchBatchInput = z.input<typeof punchBatchSchema>;
export type PunchBatchData = z.output<typeof punchBatchSchema>;

/** A punch as its owner sees it (FR-ATT-06: offline label + actual received time). */
export const myPunchSchema = z.object({
  id: z.string(),
  clientRef: z.string().nullable(),
  kind: z.nativeEnum(PunchKind),
  workDate: z.string(),
  capturedAt: z.string(),
  receivedAt: z.string(),
  source: z.string(),
  offline: z.boolean(),
  offsite: z.boolean(),
  offsiteReason: z.string().nullable(),
  distanceMetres: z.number().nullable(),
  accuracyMetres: z.number().nullable(),
  suspicious: z.boolean(),
  suspiciousReasons: z.array(z.string()),
  reviewStatus: z.nativeEnum(PunchReviewStatus),
});
export type MyPunch = z.infer<typeof myPunchSchema>;

export const PUNCH_RESULTS = ['created', 'replayed', 'rejected'] as const;
export type PunchResultKind = (typeof PUNCH_RESULTS)[number];

/** Outcome of one batch item; one bad item never fails the batch. */
export const punchItemResultSchema = z.object({
  clientRef: z.string(),
  result: z.enum(PUNCH_RESULTS),
  /** Error code (translated with `error.<code>`) when rejected. */
  error: z.string().optional(),
  /** Distance from the branch for `attendance_outside_zone`. */
  distanceMetres: z.number().optional(),
  punch: myPunchSchema.optional(),
});
export type PunchItemResult = z.infer<typeof punchItemResultSchema>;

export const punchBatchResponseSchema = z.object({
  serverTime: z.string(),
  results: z.array(punchItemResultSchema),
});
export type PunchBatchResponse = z.infer<typeof punchBatchResponseSchema>;

export const myPunchesQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date'),
  })
  .refine((v) => v.from <= v.to, { message: 'invalid_date', path: ['to'] });
export type MyPunchesQuery = z.infer<typeof myPunchesQuerySchema>;

/** Everything the check-in screen needs, from the API (FR-ATT-01/15). */
export const checkinStatusSchema = z.object({
  serverTime: z.string(),
  workDate: z.string(),
  timeZone: z.string(),
  /** Today's scheduled window; null on a rest day or without a shift. */
  shift: z
    .object({ name: z.string().nullable(), startTime: z.string(), endTime: z.string(), scheduledStart: z.string(), scheduledEnd: z.string() })
    .nullable(),
  branch: z
    .object({
      id: z.string(),
      name: z.string(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      geofenceRadius: z.number(),
      attendanceModes: z.array(z.nativeEnum(AttendanceMode)),
    })
    .nullable(),
  /** MOBILE is enabled at the employee's branch. */
  mobileEnabled: z.boolean(),
  selfieRequired: z.boolean(),
  maxAccuracyMetres: z.number(),
  offlineAlertHours: z.number(),
  deviceTimeToleranceMinutes: z.number(),
  /** Device binding of the caller (FR-ATT-11.1); null = none yet (the first punch binds). */
  device: z.object({ deviceId: z.string(), platform: z.string(), model: z.string().nullable() }).nullable(),
  /** Off-site permission covering today (FR-ATT-16). */
  offsitePermission: z.object({ id: z.string(), fromDate: z.string(), toDate: z.string(), note: z.string().nullable() }).nullable(),
  lastPunch: myPunchSchema.nullable(),
  /** Next punch kind the button offers. */
  nextKind: z.nativeEnum(PunchKind),
  day: z
    .object({
      status: z.nativeEnum(AttendanceStatus),
      firstInAt: z.string().nullable(),
      lastOutAt: z.string().nullable(),
      lateMinutes: z.number(),
      earlyLeaveMinutes: z.number(),
      workedMinutes: z.number(),
    })
    .nullable(),
});
export type CheckinStatus = z.infer<typeof checkinStatusSchema>;
