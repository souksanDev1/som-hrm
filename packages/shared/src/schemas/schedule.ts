import { z } from 'zod';
import { DAYS_PER_WEEK, SCHEDULE_HOURS_STEP } from '../domain/work-schedule';
import { idSchema, isoDateSchema } from './common';

/** Hours per weekday, index 0 = Sunday … 6 = Saturday; 0 = rest day; half hours allowed (FR-WS-03). */
export const dayHoursSchema = z.array(z.number().min(0).max(24).multipleOf(SCHEDULE_HOURS_STEP)).length(DAYS_PER_WEEK);

const reasonSchema = z.string().trim().min(1, 'required').max(500);
/** One bulk action covers at most this many employees (FR-WS-03.3). */
export const SCHEDULE_BULK_MAX = 500;
const employeeIdsSchema = z.array(idSchema).min(1).max(SCHEDULE_BULK_MAX);

/** The pattern in force for an employee on a date (see `resolveWorkPattern`). */
export const resolvedWorkPatternSchema = z.object({
  source: z.enum(['standard', 'override']),
  scheduleId: z.string(),
  effectiveFrom: z.string(),
  dayHours: z.array(z.number()),
  workingDays: z.array(z.number().int()),
  weeklyHours: z.number(),
  label: z.string().nullable(),
});
export type ResolvedWorkPatternView = z.infer<typeof resolvedWorkPatternSchema>;

/** One version of the workspace standard schedule (FR-WS-03.1). */
export const standardScheduleVersionSchema = z.object({
  id: z.string(),
  effectiveFrom: z.string(),
  dayHours: z.array(z.number()),
  weeklyHours: z.number(),
  reason: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type StandardScheduleVersion = z.infer<typeof standardScheduleVersionSchema>;

export const workPatternLimitsSchema = z.object({ maxHoursPerDay: z.number(), maxHoursPerWeek: z.number() });

/** Settings view of the standard schedule, evaluated for today in the workspace time zone. */
export const standardScheduleViewSchema = z.object({
  asOf: z.string(),
  current: standardScheduleVersionSchema,
  /** Versions that take effect in the future, soonest first. */
  scheduled: z.array(standardScheduleVersionSchema),
  /** Versions already in effect (incl. the current one), newest first. */
  history: z.array(standardScheduleVersionSchema),
  /** Limits in force today (parameters `schedule.standardHoursPerDay`, `schedule.maxHoursPerWeek`). */
  limits: workPatternLimitsSchema,
});
export type StandardScheduleView = z.infer<typeof standardScheduleViewSchema>;

/** Schedule a new standard from `effectiveFrom` (>= today). Employees with an override keep it (FR-WS-03.6). */
export const setStandardScheduleSchema = z.object({
  dayHours: dayHoursSchema,
  effectiveFrom: isoDateSchema,
  reason: reasonSchema,
});
export type SetStandardScheduleInput = z.infer<typeof setStandardScheduleSchema>;

/** Give one or more employees their own pattern from `effectiveFrom` (FR-WS-03.2/03.3). */
export const applyScheduleOverrideSchema = z.object({
  employeeIds: employeeIdsSchema,
  dayHours: dayHoursSchema,
  effectiveFrom: isoDateSchema,
  reason: reasonSchema,
  label: z.string().trim().max(100).optional(),
});
export type ApplyScheduleOverrideInput = z.infer<typeof applyScheduleOverrideSchema>;

/** Put employees with an override back on the standard from `effectiveFrom` (FR-WS-03.4). */
export const revertScheduleOverrideSchema = z.object({
  employeeIds: employeeIdsSchema,
  effectiveFrom: isoDateSchema,
  reason: reasonSchema,
});
export type RevertScheduleOverrideInput = z.infer<typeof revertScheduleOverrideSchema>;

export const scheduleBulkResultSchema = z.object({ count: z.number().int() });
export type ScheduleBulkResult = z.infer<typeof scheduleBulkResultSchema>;

/** One effective-dated assignment of an employee: an override pattern, or back to the standard. */
export const scheduleAssignmentSchema = z.object({
  id: z.string(),
  effectiveFrom: z.string(),
  source: z.enum(['standard', 'override']),
  /** Override pattern; `null` when the assignment returns the employee to the standard. */
  dayHours: z.array(z.number()).nullable(),
  label: z.string().nullable(),
  reason: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type ScheduleAssignment = z.infer<typeof scheduleAssignmentSchema>;

/** Working schedule of one employee (FR-WS-03.5): what applies today plus their assignment timeline. */
export const employeeWorkScheduleSchema = z.object({
  employeeId: z.string(),
  asOf: z.string(),
  current: resolvedWorkPatternSchema,
  /** Assignments that take effect in the future, soonest first. */
  upcoming: z.array(scheduleAssignmentSchema),
  /** Assignments already in effect, newest first. */
  history: z.array(scheduleAssignmentSchema),
});
export type EmployeeWorkSchedule = z.infer<typeof employeeWorkScheduleSchema>;

/** An employee who works an override today or has an assignment scheduled. */
export const scheduleOverrideRowSchema = z.object({
  employee: z.object({ id: z.string(), employeeCode: z.string(), name: z.string() }),
  current: resolvedWorkPatternSchema,
  /** The next scheduled assignment, if any. */
  next: scheduleAssignmentSchema.nullable(),
});
export type ScheduleOverrideRow = z.infer<typeof scheduleOverrideRowSchema>;

export const scheduleOverrideListSchema = z.object({ asOf: z.string(), items: z.array(scheduleOverrideRowSchema) });
export type ScheduleOverrideList = z.infer<typeof scheduleOverrideListSchema>;
