import {
  addDays,
  holidayAppliesTo,
  minutesToHours,
  resolveWorkPattern,
  scheduledHoursOn,
  type ScheduleAssignmentInput,
  type ShiftTimes,
  type StandardScheduleVersionInput,
} from '@hrm/shared';
import type { Tx } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { parametersRepository } from '../parameters/parameters.repository';
import { schedulesRepository } from '../schedules/schedules.repository';

/** A shift as the calculation needs it: times plus the per-shift grace overrides (null = parameter). */
export interface DayShift extends ShiftTimes {
  id: string;
  lateGraceMinutes: number | null;
  earlyGraceMinutes: number | null;
}

/** What one employee is scheduled to do on one work date (FR-ATT-17/18). */
export interface EmployeeDay {
  date: string;
  /** Shift worked: the roster's, else the work schedule's. Null on a rostered rest day. */
  shift: DayShift | null;
  /**
   * Scheduled paid minutes: the work pattern's minutes for that weekday (0 = rest day); null = the full shift
   * (a rostered day).
   */
  scheduledMinutes: number | null;
  /** The date is a holiday for this employee (8 March women only, foreign national days, FR-WS-05). */
  isHoliday: boolean;
  /** Scheduled rest day (pattern 0 minutes, or rostered off). */
  isRestDay: boolean;
}

const iso = (d: Date) => toIsoDate(d)!;

/**
 * Schedule, roster and holidays of one employee for each of `dates` (YYYY-MM-DD, workspace time zone), resolved
 * in one round of queries. Roster rows override the work schedule's shift (FR-ATT-17.3); the work pattern decides
 * rest days otherwise (FR-WS-03). Run inside the caller's tenant transaction.
 */
export const loadEmployeeDays = async (tx: Tx, workspaceId: string, employeeId: string, dates: readonly string[]): Promise<Map<string, EmployeeDay>> => {
  const out = new Map<string, EmployeeDay>();
  if (!dates.length) return out;
  const sorted = [...new Set(dates)].sort();
  const from = parseIsoDate(sorted[0]!);
  const to = parseIsoDate(sorted[sorted.length - 1]!);

  const [employee, standards, assignments, roster, holidays] = await Promise.all([
    tx.employee.findFirstOrThrow({ where: { id: employeeId, workspaceId }, select: { gender: true, nationality: true } }),
    schedulesRepository.listStandardVersions(tx, workspaceId),
    schedulesRepository.listAssignments(tx, workspaceId, [employeeId]),
    tx.shiftRoster.findMany({ where: { workspaceId, employeeId, date: { gte: from, lte: to } } }),
    tx.holiday.findMany({ where: { workspaceId, date: { gte: from, lte: to } } }),
  ]);
  const scheduleIds = [...new Set([...standards.map((s) => s.id), ...assignments.flatMap((a) => (a.schedule ? [a.schedule.id] : []))])];
  const scheduleShift = new Map(
    (await tx.workSchedule.findMany({ where: { workspaceId, id: { in: scheduleIds } }, select: { id: true, shiftId: true } })).map((s) => [s.id, s.shiftId]),
  );
  const shiftIds = [...new Set([...scheduleShift.values(), ...roster.flatMap((r) => (r.shiftId ? [r.shiftId] : []))])];
  const shifts = new Map(
    (await tx.shift.findMany({ where: { workspaceId, id: { in: shiftIds } } })).map((s): [string, DayShift] => [
      s.id,
      { id: s.id, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, lateGraceMinutes: s.lateGraceMinutes, earlyGraceMinutes: s.earlyGraceMinutes },
    ]),
  );

  const standardInputs: StandardScheduleVersionInput[] = standards.map((v) => ({ id: v.id, effectiveFrom: iso(v.effectiveFrom!), dayHours: minutesToHours(v.dayMinutes) }));
  const assignmentInputs: ScheduleAssignmentInput[] = assignments.map((a) => ({
    effectiveFrom: iso(a.effectiveFrom),
    schedule: a.schedule ? { id: a.schedule.id, dayHours: minutesToHours(a.schedule.dayMinutes) } : null,
  }));
  const rosterByDate = new Map(roster.map((r) => [iso(r.date), r]));
  const holidayDates = new Set(holidays.filter((h) => holidayAppliesTo(employee, h)).map((h) => iso(h.date)));

  for (const date of sorted) {
    const rostered = rosterByDate.get(date);
    const isHoliday = holidayDates.has(date);
    if (rostered) {
      const shift = rostered.shiftId ? (shifts.get(rostered.shiftId) ?? null) : null;
      out.set(date, { date, shift, scheduledMinutes: shift ? null : 0, isHoliday, isRestDay: !shift });
      continue;
    }
    const pattern = resolveWorkPattern(date, standardInputs, assignmentInputs);
    const minutes = pattern ? Math.round(scheduledHoursOn(pattern.dayHours, date) * 60) : 0;
    const shiftId = pattern ? scheduleShift.get(pattern.scheduleId) : undefined;
    out.set(date, { date, shift: shiftId ? (shifts.get(shiftId) ?? null) : null, scheduledMinutes: minutes, isHoliday, isRestDay: minutes === 0 });
  }
  return out;
};

/** The shift a day contributes to `workDateOf`: none on rest days, so early-morning punches stay on their own date. */
export const workingShiftOf = (day: EmployeeDay | undefined): ShiftTimes | null =>
  day && day.shift && day.scheduledMinutes !== 0 ? day.shift : null;

/** Dates around an instant's local date that `workDateOf` may consult (the day before and the day itself). */
export const candidateDates = (localDate: string): string[] => [addDays(localDate, -1), localDate];

export const workspaceTimeZone = (tx: Tx, workspaceId: string) => parametersRepository.workspaceTimezone(tx, workspaceId);

/**
 * Day-context reads memoised for one operation that does not itself change schedules, rosters, holidays or the
 * workspace time zone — storing punches. The time zone is read once and each employee's days are loaded once
 * per date, so assigning work dates and recomputing the days after the insert reuse the same reads.
 */
export interface DayContextMemo {
  timeZone(): Promise<string>;
  days(employeeId: string, dates: readonly string[]): Promise<Map<string, EmployeeDay>>;
}

export const createDayContextMemo = (tx: Tx, workspaceId: string): DayContextMemo => {
  let timeZone: Promise<string> | null = null;
  const loaded = new Map<string, Map<string, EmployeeDay>>();
  return {
    timeZone: () => (timeZone ??= workspaceTimeZone(tx, workspaceId)),
    async days(employeeId, dates) {
      const known = loaded.get(employeeId) ?? new Map<string, EmployeeDay>();
      loaded.set(employeeId, known);
      const missing = [...new Set(dates)].filter((d) => !known.has(d));
      if (missing.length) (await loadEmployeeDays(tx, workspaceId, employeeId, missing)).forEach((day, date) => known.set(date, day));
      return new Map(dates.map((d) => [d, known.get(d)!]));
    },
  };
};
