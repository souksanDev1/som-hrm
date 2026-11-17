import { z } from 'zod';
import { REQUEST_STATUSES } from '../enums';
import { parseTimeOfDay } from '../domain/parameters';
import { idSchema, isoDateSchema } from './common';

/**
 * Overtime requests (FR-ATT-20..23). Times are local "HH:mm" in the workspace time zone: `start` is on `workDate`
 * (the local date the OT starts) and an `end` not after `start` is on the next day (OT across midnight).
 */
export const OVERTIME_KINDS = ['PRE', 'POST'] as const;

export const timeOfDaySchema = z
  .string()
  .trim()
  .refine((v) => /^\d{2}:\d{2}$/.test(v) && parseTimeOfDay(v) !== null, 'invalid_time');

/** Calendar month "YYYY-MM". */
export const isoMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'invalid_month');

export const overtimeInputSchema = z
  .object({
    kind: z.enum(OVERTIME_KINDS),
    workDate: isoDateSchema,
    start: timeOfDaySchema,
    end: timeOfDaySchema,
    reason: z.string().trim().min(1, 'required').max(500),
  })
  .refine((v) => v.start !== v.end, { path: ['end'], message: 'ot_invalid_period' });
export type OvertimeInput = z.infer<typeof overtimeInputSchema>;

/** Preview takes the same fields; the reason is not needed yet. */
export const overtimePreviewInputSchema = z
  .object({
    kind: z.enum(OVERTIME_KINDS),
    workDate: isoDateSchema,
    start: timeOfDaySchema,
    end: timeOfDaySchema,
  })
  .refine((v) => v.start !== v.end, { path: ['end'], message: 'ot_invalid_period' });
export type OvertimePreviewInput = z.infer<typeof overtimePreviewInputSchema>;

/** The four OT categories in minutes (FR-ATT-21.1–21.4). */
export const overtimeSplitSchema = z.object({
  workdayDayMinutes: z.number().int(),
  workdayNightMinutes: z.number().int(),
  holidayDayMinutes: z.number().int(),
  holidayNightMinutes: z.number().int(),
});

export const OVERTIME_CATEGORIES = ['workdayDayMinutes', 'workdayNightMinutes', 'holidayDayMinutes', 'holidayNightMinutes'] as const;
export type OvertimeCategory = (typeof OVERTIME_CATEGORIES)[number];

/** Translation key of a category (`ot.category.*`). */
export const overtimeCategoryKey = (c: OvertimeCategory) => `ot.category.${c.replace(/Minutes$/, '')}` as const;

export const capStatusSchema = z.object({
  total: z.number().int(),
  cap: z.number().int(),
  exceeded: z.boolean(),
  warn: z.boolean(),
});

/** Result of `POST /overtime/preview`: the split and both cap checks (FR-ATT-22). */
export const overtimePreviewSchema = overtimeSplitSchema.extend({
  start: z.string(),
  end: z.string(),
  minutes: z.number().int(),
  day: capStatusSchema,
  month: capStatusSchema,
  warnPercent: z.number().int(),
});
export type OvertimePreview = z.infer<typeof overtimePreviewSchema>;

export const overtimeRequestSchema = overtimeSplitSchema.extend({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeName: z.string(),
  kind: z.enum(OVERTIME_KINDS),
  workDate: z.string(),
  plannedStart: z.string(),
  plannedEnd: z.string(),
  /** Local "HH:mm" of the planned window. */
  plannedStartTime: z.string(),
  plannedEndTime: z.string(),
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  actualStartTime: z.string().nullable(),
  actualEndTime: z.string().nullable(),
  reason: z.string(),
  /** Counted minutes: the actual period once known, else the planned one. */
  minutes: z.number().int(),
  status: z.enum(REQUEST_STATUSES),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  approvalRequestId: z.string().nullable(),
});
export type OvertimeRequestView = z.infer<typeof overtimeRequestSchema>;

export const overtimeTotalsSchema = overtimeSplitSchema.extend({ totalMinutes: z.number().int() });
export type OvertimeTotals = z.infer<typeof overtimeTotalsSchema>;

export const overtimeMonthQuerySchema = z.object({ month: isoMonthSchema });

/** `GET /overtime/me`: own requests of the month and approved totals by category (FR-ATT-23). */
export const myOvertimeSchema = z.object({
  month: z.string(),
  items: z.array(overtimeRequestSchema),
  approved: overtimeTotalsSchema,
  pendingMinutes: z.number().int(),
});
export type MyOvertime = z.infer<typeof myOvertimeSchema>;

export const overtimeReportQuerySchema = z.object({ month: isoMonthSchema, employeeId: idSchema.optional() });
export type OvertimeReportQuery = z.infer<typeof overtimeReportQuerySchema>;

export const overtimeReportRowSchema = overtimeTotalsSchema.extend({
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeName: z.string(),
  requests: z.number().int(),
});
export type OvertimeReportRow = z.infer<typeof overtimeReportRowSchema>;

/** `GET /overtime`: approved OT of the month per employee and category — payroll input (FR-ATT-21). */
export const overtimeReportSchema = z.object({
  month: z.string(),
  rows: z.array(overtimeReportRowSchema),
  totals: overtimeTotalsSchema,
  items: z.array(overtimeRequestSchema),
});
export type OvertimeReport = z.infer<typeof overtimeReportSchema>;
