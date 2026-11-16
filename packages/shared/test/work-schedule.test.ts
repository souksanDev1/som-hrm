import { describe, expect, it } from 'vitest';
import {
  applyScheduleOverrideSchema,
  dayHoursSchema,
  dictionaries,
  hoursToMinutes,
  minutesToHours,
  PARAMETERS,
  patternFromWorkingDays,
  resolveStandardVersion,
  resolveWorkPattern,
  scheduledHoursOn,
  validateParameterValue,
  validateWorkPattern,
  weekdayOf,
  weeklyHoursOf,
  workingDaysOf,
  type ScheduleAssignmentInput,
  type StandardScheduleVersionInput,
} from '../src';

const SIX_DAYS = [0, 8, 8, 8, 8, 8, 8];
const FIVE_DAYS = [0, 8, 8, 8, 8, 8, 0];
const HALF_SAT = [0, 8, 8, 8, 8, 8, 4];
const REST_MONDAY = [8, 0, 8, 8, 8, 8, 8];
const LIMITS = { maxHoursPerDay: 8, maxHoursPerWeek: 48 };

const std = (id: string, effectiveFrom: string, dayHours: number[]): StandardScheduleVersionInput => ({ id, effectiveFrom, dayHours });
const override = (effectiveFrom: string, id: string, dayHours: number[], label: string | null = null): ScheduleAssignmentInput => ({
  effectiveFrom,
  schedule: { id, dayHours, label },
});
const revert = (effectiveFrom: string): ScheduleAssignmentInput => ({ effectiveFrom, schedule: null });

describe('pattern helpers', () => {
  it('builds the Lao default Mon–Sat 8 h pattern (48 h)', () => {
    const p = patternFromWorkingDays([1, 2, 3, 4, 5, 6], PARAMETERS['schedule.standardHoursPerDay'].defaultValue);
    expect(p).toEqual(SIX_DAYS);
    expect(weeklyHoursOf(p)).toBe(48);
    expect(workingDaysOf(p)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(workingDaysOf(REST_MONDAY)).toEqual([0, 2, 3, 4, 5, 6]);
  });

  it('maps calendar dates to weekdays and scheduled hours', () => {
    expect(weekdayOf('2026-11-15')).toBe(0); // Sunday
    expect(weekdayOf('2026-11-21')).toBe(6); // Saturday
    expect(scheduledHoursOn(HALF_SAT, '2026-11-21')).toBe(4);
    expect(scheduledHoursOn(HALF_SAT, '2026-11-15')).toBe(0);
  });

  it('round-trips hours and stored minutes', () => {
    expect(hoursToMinutes(HALF_SAT)).toEqual([0, 480, 480, 480, 480, 480, 240]);
    expect(minutesToHours([0, 450, 480, 480, 480, 480, 240])).toEqual([0, 7.5, 8, 8, 8, 8, 4]);
  });
});

describe('validateWorkPattern', () => {
  it('accepts 6×8, 5×8, half Saturday and 7.5 h days', () => {
    expect(validateWorkPattern(SIX_DAYS, LIMITS)).toBeNull();
    expect(validateWorkPattern(FIVE_DAYS, LIMITS)).toBeNull();
    expect(validateWorkPattern(HALF_SAT, LIMITS)).toBeNull();
    expect(validateWorkPattern([0, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5], LIMITS)).toBeNull();
  });

  it('rejects malformed patterns', () => {
    expect(validateWorkPattern([8, 8, 8], LIMITS)).toBe('schedule_invalid_pattern');
    expect(validateWorkPattern([0, 8.25, 8, 8, 8, 8, 0], LIMITS)).toBe('schedule_invalid_pattern');
    expect(validateWorkPattern([0, -1, 8, 8, 8, 8, 0], LIMITS)).toBe('schedule_invalid_pattern');
    expect(validateWorkPattern([0, 0, 0, 0, 0, 0, 0], LIMITS)).toBe('schedule_no_working_days');
  });

  it('enforces the daily and weekly limits inclusively', () => {
    expect(validateWorkPattern([0, 8.5, 8, 8, 8, 8, 0], LIMITS)).toBe('schedule_day_hours_exceeded');
    expect(validateWorkPattern([8, 8, 8, 8, 8, 8, 0.5], LIMITS)).toBe('schedule_week_hours_exceeded');
    expect(validateWorkPattern([0, 8, 8, 8, 8, 8, 8], LIMITS)).toBeNull(); // exactly 48
    expect(validateWorkPattern([0, 6, 6, 6, 6, 6, 6], { maxHoursPerDay: 6, maxHoursPerWeek: 36 })).toBeNull();
    expect(validateWorkPattern(SIX_DAYS, { maxHoursPerDay: 8, maxHoursPerWeek: 40 })).toBe('schedule_week_hours_exceeded');
  });
});

describe('schedule parameters (Lao labour law)', () => {
  it('default to 8 h/day and 48 h/week and reject values above the legal maximum', () => {
    expect(PARAMETERS['schedule.standardHoursPerDay'].defaultValue).toBe(8);
    expect(PARAMETERS['schedule.maxHoursPerWeek'].defaultValue).toBe(48);
    expect(validateParameterValue('schedule.maxHoursPerWeek', 48)).toBeNull();
    expect(validateParameterValue('schedule.maxHoursPerWeek', 40)).toBeNull();
    expect(validateParameterValue('schedule.maxHoursPerWeek', 49)).toBe('above_legal_maximum');
    expect(validateParameterValue('schedule.standardHoursPerDay', 9)).toBe('above_legal_maximum');
    expect(validateParameterValue('schedule.standardHoursPerDay', 0)).toBe('out_of_range');
  });
});

describe('resolveStandardVersion', () => {
  const versions = [std('v2', '2027-01-01', FIVE_DAYS), std('v1', '2026-11-16', SIX_DAYS), std('v3', '2027-06-01', HALF_SAT)];
  it('picks the latest version on or before the date, in any input order', () => {
    expect(resolveStandardVersion(versions, '2026-12-31')?.id).toBe('v1');
    expect(resolveStandardVersion(versions, '2027-01-01')?.id).toBe('v2');
    expect(resolveStandardVersion(versions, '2027-05-31')?.id).toBe('v2');
    expect(resolveStandardVersion(versions, '2027-06-01')?.id).toBe('v3');
    expect(resolveStandardVersion(versions, '2099-01-01')?.id).toBe('v3');
  });
  it('lets the earliest version cover dates before it, and returns undefined without versions', () => {
    expect(resolveStandardVersion(versions, '2020-01-01')?.id).toBe('v1');
    expect(resolveStandardVersion(versions, '2026-11-15')?.id).toBe('v1');
    expect(resolveStandardVersion([], '2026-11-16')).toBeUndefined();
  });
});

describe('resolveWorkPattern', () => {
  const standards = [std('s1', '2026-01-01', SIX_DAYS), std('s2', '2027-01-01', FIVE_DAYS)];

  it('uses the standard when the employee has no assignment', () => {
    expect(resolveWorkPattern('2026-06-01', standards, [])).toEqual({
      source: 'standard',
      scheduleId: 's1',
      effectiveFrom: '2026-01-01',
      dayHours: SIX_DAYS,
      workingDays: [1, 2, 3, 4, 5, 6],
      weeklyHours: 48,
      label: null,
    });
  });

  it('switches to a new standard exactly on its effective date', () => {
    expect(resolveWorkPattern('2026-12-31', standards, [])?.scheduleId).toBe('s1');
    expect(resolveWorkPattern('2027-01-01', standards, [])?.scheduleId).toBe('s2');
  });

  it('applies an override from its effective date (day before → standard)', () => {
    const a = [override('2026-03-10', 'o1', REST_MONDAY, 'Rest Monday')];
    expect(resolveWorkPattern('2026-03-09', standards, a)?.source).toBe('standard');
    const on = resolveWorkPattern('2026-03-10', standards, a)!;
    expect(on).toMatchObject({ source: 'override', scheduleId: 'o1', effectiveFrom: '2026-03-10', label: 'Rest Monday', weeklyHours: 48 });
    expect(on.workingDays).toEqual([0, 2, 3, 4, 5, 6]);
  });

  it('keeps an override when the standard changes (FR-WS-03.6)', () => {
    const a = [override('2026-03-10', 'o1', HALF_SAT)];
    expect(resolveWorkPattern('2027-01-01', standards, a)).toMatchObject({ source: 'override', scheduleId: 'o1', dayHours: HALF_SAT });
  });

  it('reverts to whichever standard is in force once a revert takes effect', () => {
    const a = [override('2026-03-10', 'o1', HALF_SAT), revert('2026-12-01')];
    expect(resolveWorkPattern('2026-11-30', standards, a)?.scheduleId).toBe('o1');
    expect(resolveWorkPattern('2026-12-01', standards, a)).toMatchObject({ source: 'standard', scheduleId: 's1' });
    // After the revert the employee follows later standard changes too.
    expect(resolveWorkPattern('2027-01-01', standards, a)).toMatchObject({ source: 'standard', scheduleId: 's2', dayHours: FIVE_DAYS });
  });

  it('uses the latest assignment on or before the date regardless of input order', () => {
    const a = [override('2026-09-01', 'o2', FIVE_DAYS), revert('2026-06-01'), override('2026-03-10', 'o1', HALF_SAT)];
    expect(resolveWorkPattern('2026-03-10', standards, a)?.scheduleId).toBe('o1');
    expect(resolveWorkPattern('2026-05-31', standards, a)?.scheduleId).toBe('o1');
    expect(resolveWorkPattern('2026-06-01', standards, a)?.source).toBe('standard');
    expect(resolveWorkPattern('2026-08-31', standards, a)?.source).toBe('standard');
    expect(resolveWorkPattern('2026-09-01', standards, a)?.scheduleId).toBe('o2');
  });

  it('handles leap days and year ends as plain calendar dates', () => {
    const a = [override('2028-02-29', 'o1', FIVE_DAYS)];
    expect(resolveWorkPattern('2028-02-28', standards, a)?.source).toBe('standard');
    expect(resolveWorkPattern('2028-02-29', standards, a)?.source).toBe('override');
    expect(resolveWorkPattern('2028-03-01', standards, a)?.source).toBe('override');
  });

  it('returns a copy, not the input array', () => {
    const r = resolveWorkPattern('2026-06-01', standards, [])!;
    r.dayHours[1] = 0;
    expect(standards[0]!.dayHours[1]).toBe(8);
  });

  it('returns null only when no standard exists and no override applies', () => {
    expect(resolveWorkPattern('2026-06-01', [], [])).toBeNull();
    expect(resolveWorkPattern('2026-06-01', [], [revert('2026-01-01')])).toBeNull();
    expect(resolveWorkPattern('2026-06-01', [], [override('2026-01-01', 'o1', FIVE_DAYS)])?.source).toBe('override');
  });
});

describe('schedule schemas', () => {
  it('accept half hours and exactly seven days', () => {
    expect(dayHoursSchema.safeParse(HALF_SAT).success).toBe(true);
    expect(dayHoursSchema.safeParse([0, 7.5, 7.5, 7.5, 7.5, 7.5, 0]).success).toBe(true);
    expect(dayHoursSchema.safeParse([0, 8, 8, 8, 8, 8]).success).toBe(false);
    expect(dayHoursSchema.safeParse([0, 8.2, 8, 8, 8, 8, 0]).success).toBe(false);
    expect(dayHoursSchema.safeParse([0, 25, 8, 8, 8, 8, 0]).success).toBe(false);
  });
  it('require employees, a date and a reason for an override', () => {
    const ok = { employeeIds: ['e1'], dayHours: FIVE_DAYS, effectiveFrom: '2026-12-01', reason: 'x' };
    expect(applyScheduleOverrideSchema.safeParse(ok).success).toBe(true);
    expect(applyScheduleOverrideSchema.safeParse({ ...ok, employeeIds: [] }).success).toBe(false);
    expect(applyScheduleOverrideSchema.safeParse({ ...ok, reason: ' ' }).success).toBe(false);
    expect(applyScheduleOverrideSchema.safeParse({ ...ok, effectiveFrom: '01/12/2026' }).success).toBe(false);
  });
});

describe('schedules i18n', () => {
  it('has Lao and English for every weekday and schedule error', () => {
    for (const locale of ['lo', 'en'] as const) {
      const d = dictionaries[locale] as Record<string, string>;
      for (let i = 0; i < 7; i++) expect(d[`schedule.day.${i}`]).toBeTruthy();
      for (const code of ['schedule_day_hours_exceeded', 'schedule_week_hours_exceeded', 'schedule_not_overridden', 'above_legal_maximum']) {
        expect(d[`error.${code}`]).toBeTruthy();
      }
    }
  });
});
