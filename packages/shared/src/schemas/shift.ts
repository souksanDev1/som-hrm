import { z } from 'zod';
import { AttendanceStatus } from '../enums';
import { idSchema, isoDateSchema } from './common';

/**
 * Shifts, rotating roster and attendance-day reports (FR-ATT-17, FR-ATT-18). Shift times are local "HH:mm" in
 * the workspace time zone; `validateShift` (domain/attendance) is the authoritative check of a shift definition.
 */

/** Every day status, in display order. */
export const ATTENDANCE_DAY_STATUSES = Object.values(AttendanceStatus) as [AttendanceStatus, ...AttendanceStatus[]];

const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'shift_invalid_time');
/** Per-shift grace override; null = the workspace parameter (same bounds as the parameter registry). */
const graceSchema = z.number().int().min(0).max(120).nullable();

export const SHIFT_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const createShiftSchema = z.object({
  name: z.string().trim().min(1, 'required').max(100),
  code: z.string().trim().max(10).nullable().optional(),
  color: z.string().regex(SHIFT_COLOR_PATTERN, 'shift_invalid_color').nullable().optional(),
  startTime: hhmmSchema,
  endTime: hhmmSchema,
  breakMinutes: z.number().int().min(0).max(720),
  lateGraceMinutes: graceSchema.optional(),
  earlyGraceMinutes: graceSchema.optional(),
});
export type CreateShiftInput = z.infer<typeof createShiftSchema>;

export const updateShiftSchema = createShiftSchema.partial().extend({ isActive: z.boolean().optional() });
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

export const shiftSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  color: z.string().nullable(),
  startTime: z.string(),
  endTime: z.string(),
  breakMinutes: z.number().int(),
  lateGraceMinutes: z.number().int().nullable(),
  earlyGraceMinutes: z.number().int().nullable(),
  isActive: z.boolean(),
  /** Ends on the next calendar day (FR-ATT-17.2). */
  crossesMidnight: z.boolean(),
  /** Paid minutes of a full shift (span minus break). */
  netMinutes: z.number().int(),
  /** Used by a work schedule or the roster: deleting it only deactivates it. */
  inUse: z.boolean(),
});
export type Shift = z.infer<typeof shiftSchema>;

export const shiftListQuerySchema = z.object({
  /** `true` = active shifts only (pickers). */
  active: z.enum(['true', 'false']).optional(),
});

export const shiftDeleteResultSchema = z.object({ result: z.enum(['deleted', 'deactivated']) });
export type ShiftDeleteResult = z.infer<typeof shiftDeleteResultSchema>;

// ─────────────────────────────── Roster ───────────────────────────────

/** Longest range one roster read or attendance-day read may span (days). */
export const ROSTER_MAX_DAYS = 62;
export const ATTENDANCE_DAYS_MAX_DAYS = 93;
/** Cells per roster write. */
export const ROSTER_BULK_MAX = 2000;

const rangeSchema = z.object({ from: isoDateSchema, to: isoDateSchema });
const rangeOrdered = (q: { from: string; to: string }) => q.from <= q.to;
const rangeError = { message: 'range_invalid', path: ['to'] };

export const rosterQuerySchema = rangeSchema.extend({ departmentId: idSchema.optional() }).refine(rangeOrdered, rangeError);
export type RosterQuery = z.infer<typeof rosterQuerySchema>;

export const rosterCellSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  /** Shift worked that day; null = rest day. */
  shiftId: z.string().nullable(),
  /** ROSTER = set in the roster; SCHEDULE = from the employee's work schedule (no roster row). */
  source: z.enum(['ROSTER', 'SCHEDULE']),
});
export type RosterCell = z.infer<typeof rosterCellSchema>;

export const rosterEmployeeSchema = z.object({
  id: z.string(),
  employeeCode: z.string(),
  name: z.string(),
  departmentName: z.string().nullable(),
});

export const rosterViewSchema = z.object({
  from: z.string(),
  to: z.string(),
  employees: z.array(rosterEmployeeSchema),
  /** One cell per employee and date. */
  cells: z.array(rosterCellSchema),
});
export type RosterView = z.infer<typeof rosterViewSchema>;

export const setRosterSchema = z.object({
  cells: z
    .array(z.object({ employeeId: idSchema, date: isoDateSchema, shiftId: idSchema.nullable() }))
    .min(1)
    .max(ROSTER_BULK_MAX),
});
export type SetRosterInput = z.infer<typeof setRosterSchema>;

export const clearRosterSchema = z.object({
  cells: z.array(z.object({ employeeId: idSchema, date: isoDateSchema })).min(1).max(ROSTER_BULK_MAX),
});
export type ClearRosterInput = z.infer<typeof clearRosterSchema>;

export const rosterWriteResultSchema = z.object({
  /** Cells written or cleared. */
  updated: z.number().int(),
  /** Past/today work dates recalculated. */
  recomputed: z.number().int(),
});
export type RosterWriteResult = z.infer<typeof rosterWriteResultSchema>;

// ─────────────────────────── Attendance days ───────────────────────────

export const attendanceDaysQuerySchema = rangeSchema
  .extend({
    employeeId: idSchema.optional(),
    status: z.enum(ATTENDANCE_DAY_STATUSES).optional(),
    departmentId: idSchema.optional(),
  })
  .refine(rangeOrdered, rangeError);
export type AttendanceDaysQuery = z.infer<typeof attendanceDaysQuerySchema>;

export const attendanceDaySchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeName: z.string(),
  departmentName: z.string().nullable(),
  workDate: z.string(),
  shiftId: z.string().nullable(),
  shiftName: z.string().nullable(),
  shiftCode: z.string().nullable(),
  shiftColor: z.string().nullable(),
  scheduledStart: z.string().nullable(),
  scheduledEnd: z.string().nullable(),
  scheduledMinutes: z.number().int(),
  firstInAt: z.string().nullable(),
  lastOutAt: z.string().nullable(),
  /**
   * The same instants as workspace-local clock times "HH:mm", with " +1" when on the day after the work date
   * (night shifts) — computed by the API so clients never convert time zones themselves.
   */
  scheduledStartLocal: z.string().nullable(),
  scheduledEndLocal: z.string().nullable(),
  firstInLocal: z.string().nullable(),
  lastOutLocal: z.string().nullable(),
  lateMinutes: z.number().int(),
  earlyLeaveMinutes: z.number().int(),
  workedMinutes: z.number().int(),
  status: z.enum(ATTENDANCE_DAY_STATUSES),
  computedAt: z.string(),
});
export type AttendanceDayView = z.infer<typeof attendanceDaySchema>;

export const attendanceDayListSchema = z.object({ items: z.array(attendanceDaySchema) });
export type AttendanceDayList = z.infer<typeof attendanceDayListSchema>;

export const attendanceSummaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'invalid_date'),
  employeeId: idSchema.optional(),
});
export type AttendanceSummaryQuery = z.infer<typeof attendanceSummaryQuerySchema>;

export const attendanceSummarySchema = z.object({
  month: z.string(),
  from: z.string(),
  to: z.string(),
  employeeId: z.string().nullable(),
  /** Number of computed days. */
  days: z.number().int(),
  counts: z.record(z.enum(ATTENDANCE_DAY_STATUSES), z.number().int()),
  lateMinutes: z.number().int(),
  earlyLeaveMinutes: z.number().int(),
  workedMinutes: z.number().int(),
});
export type AttendanceSummary = z.infer<typeof attendanceSummarySchema>;
