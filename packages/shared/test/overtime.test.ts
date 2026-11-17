import { describe, expect, it } from 'vitest';
import {
  capStatus,
  formatDurationMinutes,
  isNightMinute,
  isoMonthSchema,
  overtimeCategoryKey,
  overtimeInputSchema,
  overtimePeriod,
  parseTimeOfDay,
  periodOverlap,
  splitOvertime,
  totalOvertimeMinutes,
  zonedInstant,
} from '../src';

const TZ = 'Asia/Vientiane';
const at = (date: string, hhmm: string) => zonedInstant(date, parseTimeOfDay(hhmm)!, TZ);
const night = { start: 22 * 60, end: 5 * 60 };
const opts = (holidays: string[] = []) => ({ timeZone: TZ, night, isHolidayOn: (d: string) => holidays.includes(d) });

describe('splitOvertime (FR-ATT-21)', () => {
  it('splits OT crossing 22:00 into day and night', () => {
    expect(splitOvertime(at('2026-11-16', '20:00'), at('2026-11-16', '23:30'), opts())).toEqual({
      workdayDayMinutes: 120,
      workdayNightMinutes: 90,
      holidayDayMinutes: 0,
      holidayNightMinutes: 0,
    });
  });
  it('ends the night window at 05:00', () => {
    expect(splitOvertime(at('2026-11-17', '04:00'), at('2026-11-17', '06:00'), opts())).toMatchObject({
      workdayNightMinutes: 60,
      workdayDayMinutes: 60,
    });
  });
  it('moves into the holiday categories at midnight of a holiday', () => {
    const s = splitOvertime(at('2026-12-01', '23:00'), at('2026-12-02', '01:00'), opts(['2026-12-02']));
    expect(s).toEqual({ workdayDayMinutes: 0, workdayNightMinutes: 60, holidayDayMinutes: 0, holidayNightMinutes: 60 });
    expect(totalOvertimeMinutes(s)).toBe(120);
  });
  it('counts a holiday day for whoever the holiday applies to only', () => {
    // 8 March is a holiday for women only: the caller passes the per-employee answer (holidayAppliesTo).
    const woman = splitOvertime(at('2026-03-08', '09:00'), at('2026-03-08', '11:00'), opts(['2026-03-08']));
    const man = splitOvertime(at('2026-03-08', '09:00'), at('2026-03-08', '11:00'), opts());
    expect(woman.holidayDayMinutes).toBe(120);
    expect(man.workdayDayMinutes).toBe(120);
  });
  it('returns zeros for an empty or reversed period', () => {
    expect(totalOvertimeMinutes(splitOvertime(at('2026-11-16', '20:00'), at('2026-11-16', '20:00'), opts()))).toBe(0);
  });
  it('handles a non-wrapping or empty night window', () => {
    expect(isNightMinute(30, { start: 0, end: 360 })).toBe(true);
    expect(isNightMinute(400, { start: 0, end: 360 })).toBe(false);
    expect(isNightMinute(400, { start: 0, end: 0 })).toBe(false);
  });
});

describe('capStatus (FR-ATT-22)', () => {
  it('warns at the warn percent and refuses over the cap', () => {
    expect(capStatus(100, 43, 180, 80)).toEqual({ total: 143, cap: 180, exceeded: false, warn: false });
    expect(capStatus(100, 44, 180, 80)).toMatchObject({ warn: true, exceeded: false });
    expect(capStatus(100, 80, 180, 80)).toMatchObject({ exceeded: false });
    expect(capStatus(100, 81, 180, 80)).toMatchObject({ exceeded: true });
  });
});

describe('overtimePeriod / periodOverlap / formatDurationMinutes (FR-ATT-20)', () => {
  it('places the end on the next day when it is not after the start', () => {
    expect(overtimePeriod('2026-11-16', '17:30', '20:00', TZ)).toEqual({ start: at('2026-11-16', '17:30'), end: at('2026-11-16', '20:00') });
    expect(overtimePeriod('2026-11-16', '21:00', '01:00', TZ)).toEqual({ start: at('2026-11-16', '21:00'), end: at('2026-11-17', '01:00') });
    expect(overtimePeriod('2026-11-16', '25:00', '01:00', TZ)).toBeNull();
  });
  it('overlaps periods without counting touching ends', () => {
    const shift = { start: at('2026-11-16', '08:00'), end: at('2026-11-16', '17:00') };
    expect(periodOverlap(shift, { start: at('2026-11-16', '17:00'), end: at('2026-11-16', '19:00') })).toBeNull();
    expect(periodOverlap(shift, { start: at('2026-11-16', '16:00'), end: at('2026-11-16', '19:00') })).toEqual({
      start: at('2026-11-16', '16:00'),
      end: at('2026-11-16', '17:00'),
    });
  });
  it('formats minutes as h:mm', () => {
    expect(formatDurationMinutes(150)).toBe('2:30');
    expect(formatDurationMinutes(0)).toBe('0:00');
  });
});

describe('overtime schemas', () => {
  it('validates times, months and refuses an empty period', () => {
    const base = { kind: 'PRE', workDate: '2026-11-16', start: '17:00', end: '19:00', reason: 'Stock count' };
    expect(overtimeInputSchema.safeParse(base).success).toBe(true);
    expect(overtimeInputSchema.safeParse({ ...base, end: '17:00' }).success).toBe(false);
    expect(overtimeInputSchema.safeParse({ ...base, start: '7:00' }).success).toBe(false);
    expect(overtimeInputSchema.safeParse({ ...base, reason: ' ' }).success).toBe(false);
    expect(isoMonthSchema.safeParse('2026-13').success).toBe(false);
    expect(isoMonthSchema.safeParse('2026-11').success).toBe(true);
    expect(overtimeCategoryKey('holidayNightMinutes')).toBe('ot.category.holidayNight');
  });
});
