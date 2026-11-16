/**
 * Working-day patterns (TOR FR-WS-03). Pure logic shared by the API, web and mobile.
 *
 * A pattern is the scheduled hours for each weekday: `dayHours[0]` = Sunday … `dayHours[6]` = Saturday,
 * `0` = rest day, half hours allowed (e.g. Saturday 4 h). Dates are ISO calendar dates (YYYY-MM-DD) in
 * the workspace time zone, so plain string comparison orders them.
 *
 * Who works which pattern on a date (FR-WS-03.2/03.6):
 * 1. The employee's latest assignment with `effectiveFrom <= date` decides: an override pattern, or
 *    "standard" (an explicit revert).
 * 2. With no assignment, or a "standard" assignment, the workspace standard version in force on that
 *    date applies. The earliest standard version also covers dates before it (the initial standard).
 * Changing the standard therefore never affects an employee whose assignment is an override.
 */

export const DAYS_PER_WEEK = 7;
/** Smallest unit of scheduled time per day, in hours. */
export const SCHEDULE_HOURS_STEP = 0.5;

export type WorkPatternSource = 'standard' | 'override';

export type WorkPatternError =
  | 'schedule_invalid_pattern'
  | 'schedule_no_working_days'
  | 'schedule_day_hours_exceeded'
  | 'schedule_week_hours_exceeded';

export interface WorkPatternLimits {
  /** Most hours any single day may have (parameter `schedule.standardHoursPerDay`). */
  maxHoursPerDay: number;
  /** Most hours the whole week may total (parameter `schedule.maxHoursPerWeek`). */
  maxHoursPerWeek: number;
}

/** A pattern with `hoursPerDay` on each of `workingDays` (0=Sun..6=Sat) and rest elsewhere. */
export const patternFromWorkingDays = (workingDays: readonly number[], hoursPerDay: number): number[] =>
  Array.from({ length: DAYS_PER_WEEK }, (_, d) => (workingDays.includes(d) ? hoursPerDay : 0));

/** Display order of weekdays in schedule UIs: Monday first, Sunday last (values are 0=Sun..6=Sat). */
export const SCHEDULE_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Hours for display: "8", "7.5". */
export const formatScheduleHours = (h: number): string => String(Math.round(h * 10) / 10);

/** Weekday numbers (0=Sun..6=Sat) that have scheduled hours. */
export const workingDaysOf = (dayHours: readonly number[]): number[] =>
  dayHours.flatMap((h, d) => (h > 0 ? [d] : []));

export const weeklyHoursOf = (dayHours: readonly number[]): number => dayHours.reduce((sum, h) => sum + h, 0);

/** Weekday (0=Sun..6=Sat) of an ISO calendar date. */
export const weekdayOf = (isoDate: string): number => new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();

/** Scheduled hours on a calendar date under `dayHours` (0 on a rest day). */
export const scheduledHoursOn = (dayHours: readonly number[], isoDate: string): number => dayHours[weekdayOf(isoDate)] ?? 0;

/** Stored as whole minutes per day (WorkSchedule.dayMinutes). */
export const hoursToMinutes = (dayHours: readonly number[]): number[] => dayHours.map((h) => Math.round(h * 60));
export const minutesToHours = (dayMinutes: readonly number[]): number[] => dayMinutes.map((m) => m / 60);

/**
 * Validate a pattern against the workspace limits in force on its effective date.
 * Returns `null` when valid. The API is authoritative; UIs may call it for early feedback.
 */
export const validateWorkPattern = (dayHours: readonly number[], limits: WorkPatternLimits): WorkPatternError | null => {
  const wellFormed =
    dayHours.length === DAYS_PER_WEEK &&
    dayHours.every((h) => Number.isFinite(h) && h >= 0 && h <= 24 && Number.isInteger(h / SCHEDULE_HOURS_STEP));
  if (!wellFormed) return 'schedule_invalid_pattern';
  if (dayHours.every((h) => h === 0)) return 'schedule_no_working_days';
  if (dayHours.some((h) => h > limits.maxHoursPerDay)) return 'schedule_day_hours_exceeded';
  if (weeklyHoursOf(dayHours) > limits.maxHoursPerWeek) return 'schedule_week_hours_exceeded';
  return null;
};

/** One version of the workspace standard schedule. */
export interface StandardScheduleVersionInput {
  id: string;
  effectiveFrom: string;
  dayHours: readonly number[];
}

/** One effective-dated employee assignment; `schedule: null` means "use the standard" (a revert). */
export interface ScheduleAssignmentInput {
  effectiveFrom: string;
  schedule: { id: string; dayHours: readonly number[]; label?: string | null } | null;
}

export interface ResolvedWorkPattern {
  source: WorkPatternSource;
  /** The WorkSchedule row (standard version or override pattern) in force. */
  scheduleId: string;
  /** First day this pattern applies: the override assignment's date, or the standard version's date. */
  effectiveFrom: string;
  dayHours: number[];
  workingDays: number[];
  weeklyHours: number;
  /** Optional name given to an override pattern. */
  label: string | null;
}

const latestOnOrBefore = <T extends { effectiveFrom: string }>(rows: readonly T[], date: string): T | undefined =>
  rows.reduce<T | undefined>(
    (best, r) => (r.effectiveFrom <= date && (!best || r.effectiveFrom > best.effectiveFrom) ? r : best),
    undefined,
  );

/** The standard version in force on `date`; the earliest version also covers earlier dates. */
export const resolveStandardVersion = <T extends StandardScheduleVersionInput>(versions: readonly T[], date: string): T | undefined =>
  latestOnOrBefore(versions, date) ??
  versions.reduce<T | undefined>((first, v) => (!first || v.effectiveFrom < first.effectiveFrom ? v : first), undefined);

const toResolved = (
  source: WorkPatternSource,
  scheduleId: string,
  effectiveFrom: string,
  dayHours: readonly number[],
  label: string | null,
): ResolvedWorkPattern => ({
  source,
  scheduleId,
  effectiveFrom,
  dayHours: [...dayHours],
  workingDays: workingDaysOf(dayHours),
  weeklyHours: weeklyHoursOf(dayHours),
  label,
});

/**
 * The pattern in force on `date` for one employee (see the module comment for the rules).
 * Inputs may be in any order. Returns `null` only when the workspace has no standard version and
 * the employee has no override in force.
 */
export const resolveWorkPattern = (
  date: string,
  standardVersions: readonly StandardScheduleVersionInput[],
  assignments: readonly ScheduleAssignmentInput[],
): ResolvedWorkPattern | null => {
  const assignment = latestOnOrBefore(assignments, date);
  if (assignment?.schedule) {
    const s = assignment.schedule;
    return toResolved('override', s.id, assignment.effectiveFrom, s.dayHours, s.label ?? null);
  }
  const standard = resolveStandardVersion(standardVersions, date);
  return standard ? toResolved('standard', standard.id, standard.effectiveFrom, standard.dayHours, null) : null;
};
