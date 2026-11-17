import { z } from 'zod';
import { REQUEST_STATUSES } from '../enums';
import { idSchema, isoDateSchema, paginationQuerySchema } from './common';
import { storedFileSchema } from './file';

/**
 * HR attendance tools and employee attendance requests (M5 agent D): suspicious-punch review (FR-ATT-14),
 * punches recorded by HR on behalf (FR-ATT-04), off-site permissions (FR-ATT-16.1), device change (FR-ATT-11.2/11.3)
 * and time corrections (FR-ATT-19).
 *
 * Wall-clock inputs ("HH:mm", "YYYY-MM-DDTHH:mm") are local to the workspace time zone and converted by the API,
 * so clients never need to know that zone. Outputs carry the instant (ISO) and its workspace-local rendering.
 */

const reasonSchema = z.string().trim().min(1, 'required').max(500);
const noteSchema = z.string().trim().max(500);

/** "HH:mm", 00:00–23:59. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalid_time');

/** Workspace-local date and time "YYYY-MM-DDTHH:mm" (no zone; the API applies the workspace time zone). */
export const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'invalid_date')
  .refine((v) => isoDateSchema.safeParse(v.slice(0, 10)).success, 'invalid_date');

export const punchKindSchema = z.enum(['IN', 'OUT']);

/** Employee named on an attendance row. */
export const attendanceEmployeeRefSchema = z.object({ id: z.string(), employeeCode: z.string(), name: z.string() });
export type AttendanceEmployeeRef = z.infer<typeof attendanceEmployeeRefSchema>;

// ───────────────────────────── Suspicious-punch review (FR-ATT-14) ─────────────────────────────

export const reviewQueueQuerySchema = paginationQuerySchema.omit({ search: true });
export type ReviewQueueQuery = z.infer<typeof reviewQueueQuerySchema>;

/** A punch as HR sees it in the review queue or after recording it on behalf. */
export const reviewPunchSchema = z.object({
  id: z.string(),
  employee: attendanceEmployeeRefSchema,
  kind: punchKindSchema,
  workDate: z.string(),
  capturedAt: z.string(),
  /** `capturedAt` in the workspace time zone, "YYYY-MM-DD HH:mm". */
  capturedLocal: z.string(),
  receivedAt: z.string(),
  receivedLocal: z.string(),
  source: z.enum(['MOBILE', 'KIOSK', 'SCANNER', 'HR_ON_BEHALF', 'CORRECTION']),
  branch: z.object({ id: z.string(), name: z.string() }).nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  accuracyMetres: z.number().nullable(),
  distanceMetres: z.number().nullable(),
  /** Stand-alone file id; download with GET /files/:id. */
  selfieFileId: z.string().nullable(),
  offline: z.boolean(),
  suspicious: z.boolean(),
  /** Translation keys `attendance.suspicion.<reason>`. */
  suspiciousReasons: z.array(z.string()),
  reviewStatus: z.enum(['NONE', 'PENDING', 'APPROVED', 'REJECTED']),
  reviewNote: z.string().nullable(),
  reason: z.string().nullable(),
});
export type ReviewPunch = z.infer<typeof reviewPunchSchema>;

/** Rejecting a punch always says why (it drops the punch from the day). */
export const reviewDecisionSchema = z
  .object({ decision: z.enum(['APPROVED', 'REJECTED']), note: noteSchema.optional() })
  .refine((v) => v.decision === 'APPROVED' || !!v.note, { message: 'required', path: ['note'] });
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;

// ───────────────────────────── HR on behalf (FR-ATT-04) ─────────────────────────────

export const onBehalfPunchSchema = z.object({
  employeeId: idSchema,
  kind: punchKindSchema,
  /** Workspace-local "YYYY-MM-DDTHH:mm" of the punch. */
  capturedAt: localDateTimeSchema,
  reason: reasonSchema,
});
export type OnBehalfPunchInput = z.infer<typeof onBehalfPunchSchema>;

// ───────────────────────────── Off-site permission (FR-ATT-16.1) ─────────────────────────────

export const createOffsitePermissionSchema = z
  .object({ employeeId: idSchema, fromDate: isoDateSchema, toDate: isoDateSchema, note: noteSchema.optional() })
  .refine((v) => v.toDate >= v.fromDate, { message: 'end_before_start', path: ['toDate'] });
export type CreateOffsitePermissionInput = z.infer<typeof createOffsitePermissionSchema>;

export const offsitePermissionQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  employeeId: idSchema.optional(),
  /** Include revoked and ended permissions (default: only those still in force or upcoming). */
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type OffsitePermissionQuery = z.infer<typeof offsitePermissionQuerySchema>;

export const offsitePermissionSchema = z.object({
  id: z.string(),
  employee: attendanceEmployeeRefSchema,
  fromDate: z.string(),
  toDate: z.string(),
  note: z.string().nullable(),
  grantedBy: z.string().nullable(),
  revokedAt: z.string().nullable(),
  /** Not revoked and not ended (today ≤ toDate in the workspace time zone). */
  active: z.boolean(),
  createdAt: z.string(),
});
export type OffsitePermission = z.infer<typeof offsitePermissionSchema>;

// ───────────────────────────── Device change (FR-ATT-11.2/11.3) ─────────────────────────────

export const devicePlatformSchema = z.enum(['IOS', 'ANDROID']);

export const createDeviceChangeSchema = z.object({
  deviceId: z.string().trim().min(1).max(200),
  platform: devicePlatformSchema,
  model: z.string().trim().max(120).optional(),
  reason: reasonSchema,
});
export type CreateDeviceChangeInput = z.infer<typeof createDeviceChangeSchema>;

export const deviceChangeRequestSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  platform: z.string(),
  model: z.string().nullable(),
  reason: z.string(),
  status: z.enum(REQUEST_STATUSES),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  approvalRequestId: z.string().nullable(),
});
export type DeviceChangeRequest = z.infer<typeof deviceChangeRequestSchema>;

export const deviceBindingSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  platform: z.string(),
  model: z.string().nullable(),
  isActive: z.boolean(),
  lastSeenAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DeviceBinding = z.infer<typeof deviceBindingSchema>;

/** HR view of one employee's phones (FR-ATT-11). */
export const employeeDevicesSchema = z.object({
  employee: attendanceEmployeeRefSchema,
  /** False when the employee has no login (no device can be bound). */
  hasLogin: z.boolean(),
  bindings: z.array(deviceBindingSchema),
  requests: z.array(deviceChangeRequestSchema),
});
export type EmployeeDevices = z.infer<typeof employeeDevicesSchema>;

export const employeeDevicesQuerySchema = z.object({ employeeId: idSchema });

// ───────────────────────────── Time correction (FR-ATT-19) ─────────────────────────────

/**
 * Requested times are "HH:mm" on `workDate` in the workspace time zone; a check-out not after the check-in
 * (requested or original) is on the next day (night shift).
 */
export const createCorrectionSchema = z
  .object({
    workDate: isoDateSchema,
    requestedCheckIn: timeOfDaySchema.optional(),
    requestedCheckOut: timeOfDaySchema.optional(),
    reason: reasonSchema,
    attachmentFileId: idSchema.optional(),
  })
  .refine((v) => !!v.requestedCheckIn || !!v.requestedCheckOut, { message: 'correction_time_required', path: ['requestedCheckIn'] });
export type CreateCorrectionInput = z.infer<typeof createCorrectionSchema>;

/** One side of a correction: the counted punch it replaces and the requested time. */
const correctionTimeSchema = z.object({
  /** Workspace-local "YYYY-MM-DD HH:mm"; null = missing / not changed. */
  original: z.string().nullable(),
  requested: z.string().nullable(),
});

export const correctionSchema = z.object({
  id: z.string(),
  employee: attendanceEmployeeRefSchema,
  workDate: z.string(),
  checkIn: correctionTimeSchema,
  checkOut: correctionTimeSchema,
  reason: z.string(),
  attachment: storedFileSchema.nullable(),
  status: z.enum(REQUEST_STATUSES),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  approvalRequestId: z.string().nullable(),
});
export type Correction = z.infer<typeof correctionSchema>;
