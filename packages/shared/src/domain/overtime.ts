/**
 * Overtime (TOR FR-ATT-20..22). Pure functions shared by the API (authoritative) and clients (preview only).
 *
 * OT minutes are recorded in four categories (FR-ATT-21); payroll applies the rates. Each minute is classed by
 * the local calendar day it falls on (holiday for *this* employee, `holidayAppliesTo`) and by the night window
 * (`ot.nightStart`–`ot.nightEnd`, minutes after local midnight; a start after the end wraps midnight).
 */
import { addDays, localDateTimeOf, zonedInstant } from './attendance';
import { parseTimeOfDay } from './parameters';

export interface OvertimeSplit {
  workdayDayMinutes: number;
  workdayNightMinutes: number;
  holidayDayMinutes: number;
  holidayNightMinutes: number;
}

export interface NightWindow {
  /** Minutes after local midnight (`ot.nightStart`). */
  start: number;
  /** Minutes after local midnight, exclusive (`ot.nightEnd`). */
  end: number;
}

export interface SplitOvertimeOptions {
  timeZone: string;
  night: NightWindow;
  /** Is this local date (YYYY-MM-DD) a holiday or rest day counted as a holiday for the employee? */
  isHolidayOn(isoDate: string): boolean;
}

const MS_PER_MINUTE = 60_000;

/** Is a minute of the day inside the night window? Equal start and end = no night window. */
export const isNightMinute = (minuteOfDay: number, night: NightWindow): boolean =>
  night.start === night.end
    ? false
    : night.start < night.end
      ? minuteOfDay >= night.start && minuteOfDay < night.end
      : minuteOfDay >= night.start || minuteOfDay < night.end;

/**
 * Split the period [start, end) into the four OT categories (FR-ATT-21.1–21.4). The period is cut at every local
 * midnight and night-window boundary, so OT crossing 22:00 or running into a holiday is divided exactly.
 */
export const splitOvertime = (start: Date, end: Date, opts: SplitOvertimeOptions): OvertimeSplit => {
  const out: OvertimeSplit = { workdayDayMinutes: 0, workdayNightMinutes: 0, holidayDayMinutes: 0, holidayNightMinutes: 0 };
  if (end.getTime() <= start.getTime()) return out;

  const cuts = new Set<number>([start.getTime(), end.getTime()]);
  const lastDate = localDateTimeOf(end, opts.timeZone).date;
  for (let d = addDays(localDateTimeOf(start, opts.timeZone).date, -1); d <= lastDate; d = addDays(d, 1)) {
    for (const minute of [0, opts.night.start, opts.night.end]) {
      const t = zonedInstant(d, minute, opts.timeZone).getTime();
      if (t > start.getTime() && t < end.getTime()) cuts.add(t);
    }
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const ms = { workdayDayMinutes: 0, workdayNightMinutes: 0, holidayDayMinutes: 0, holidayNightMinutes: 0 };
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i]!;
    const to = sorted[i + 1]!;
    const local = localDateTimeOf(new Date(from), opts.timeZone);
    const holiday = opts.isHolidayOn(local.date);
    const night = isNightMinute(local.minuteOfDay, opts.night);
    const key: keyof OvertimeSplit = holiday ? (night ? 'holidayNightMinutes' : 'holidayDayMinutes') : night ? 'workdayNightMinutes' : 'workdayDayMinutes';
    ms[key] += to - from;
  }
  for (const k of Object.keys(ms) as (keyof OvertimeSplit)[]) out[k] = Math.round(ms[k] / MS_PER_MINUTE);
  return out;
};

export const totalOvertimeMinutes = (s: OvertimeSplit): number =>
  s.workdayDayMinutes + s.workdayNightMinutes + s.holidayDayMinutes + s.holidayNightMinutes;

export interface CapStatus {
  /** Minutes already counted plus this request. */
  total: number;
  cap: number;
  /** Over the cap: the request is refused (client decision 2026-11-17, Q4). */
  exceeded: boolean;
  /** At or above `warnPercent` of the cap (FR-ATT-22.2). */
  warn: boolean;
}

/**
 * Cap check for one period (day or month, FR-ATT-22). `usedMinutes` = approved + pending OT already in the period,
 * `requestMinutes` = this request.
 */
export const capStatus = (usedMinutes: number, requestMinutes: number, cap: number, warnPercent: number): CapStatus => {
  const total = usedMinutes + requestMinutes;
  return { total, cap, exceeded: total > cap, warn: total >= (cap * warnPercent) / 100 };
};

export interface Period {
  start: Date;
  end: Date;
}

/**
 * The OT period of a request (FR-ATT-20): local "HH:mm" `start` on `workDate` (the local date the OT starts) and
 * `end` on the same day, or on the next day when it is not after `start` (OT across midnight). `null` for a
 * malformed time.
 */
export const overtimePeriod = (workDate: string, start: string, end: string, timeZone: string): Period | null => {
  const s = parseTimeOfDay(start);
  const e = parseTimeOfDay(end);
  if (s === null || e === null) return null;
  return { start: zonedInstant(workDate, s, timeZone), end: zonedInstant(workDate, e > s ? e : e + 24 * 60, timeZone) };
};

/** The common part of two periods, or `null` when they do not overlap (touching ends do not overlap). */
export const periodOverlap = (a: Period, b: Period): Period | null => {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  return end > start ? { start: new Date(start), end: new Date(end) } : null;
};

/** Minutes as "h:mm" for display (e.g. 150 → "2:30"). */
export const formatDurationMinutes = (minutes: number): string => {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
