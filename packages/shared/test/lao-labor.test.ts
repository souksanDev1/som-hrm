import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAVE_TYPES, LEAVE_LEGAL_MINIMUM, validateLeavePolicy, WORK_WEEK } from '../src';

const seed = (code: string) => DEFAULT_LEAVE_TYPES.find((t) => t.code === code)!;

describe('Lao labour defaults', () => {
  it('uses a 6-day working week with Sunday off', () => {
    expect(WORK_WEEK.workingDays).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('seeds annual 15 (18 hazardous) after a year, sick 30, maternity 105 / 120 calendar days', () => {
    expect(seed('ANNUAL')).toMatchObject({ daysPerYear: 15, hazardousDays: 18, minServiceDays: 365, quotaPeriod: 'YEARLY' });
    expect(seed('SICK')).toMatchObject({ daysPerYear: 30, minServiceDays: 90, minServicePayTypes: ['DAILY', 'HOURLY'], requiresAttachment: true });
    expect(seed('MATERNITY')).toMatchObject({ daysPerYear: 105, multipleBirthDays: 120, countingMethod: 'CALENDAR_DAYS', quotaPeriod: 'PER_EVENT', gender: 'FEMALE' });
  });
  it('treats the 3-day event leaves as per request and unpaid as unlimited (Q11)', () => {
    for (const code of ['PERSONAL', 'MARRIAGE', 'BEREAVEMENT']) expect(seed(code)).toMatchObject({ daysPerYear: 3, quotaPeriod: 'PER_EVENT' });
    expect(seed('UNPAID').quotaPeriod).toBe('UNLIMITED');
  });
  it('every seeded statutory policy meets its own legal minimum', () => {
    for (const t of DEFAULT_LEAVE_TYPES) {
      expect(validateLeavePolicy(t.category, { daysPerYear: t.daysPerYear, hazardousDays: t.hazardousDays ?? null, multipleBirthDays: t.multipleBirthDays ?? null })).toBeNull();
    }
    expect(LEAVE_LEGAL_MINIMUM.UNPAID).toBeUndefined();
    expect(LEAVE_LEGAL_MINIMUM.OTHER).toBeUndefined();
  });
});
