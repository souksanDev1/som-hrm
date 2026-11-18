import { describe, expect, it } from 'vitest';
import {
  entriesOnDate,
  LEAVE_CALENDAR_MAX_DAYS,
  leaveCalendarDay,
  leaveCalendarRange,
  leaveCalendarRangeTooLong,
  leaveCalendarResponseSchema,
  monthGrid,
  shiftLeaveCalendarAnchor,
  startOfWeek,
  weekDates,
} from '../src';

describe('leave calendar date helpers (FR-LV-13.2/13.3)', () => {
  it('weeks start on Monday', () => {
    expect(startOfWeek('2030-12-04')).toBe('2030-12-02'); // Wed → Mon
    expect(startOfWeek('2030-12-08')).toBe('2030-12-02'); // Sun → previous Mon
    expect(startOfWeek('2030-12-02')).toBe('2030-12-02');
    expect(weekDates('2030-12-31')).toEqual(['2030-12-30', '2030-12-31', '2031-01-01', '2031-01-02', '2031-01-03', '2031-01-04', '2031-01-05']);
  });

  it('builds a rectangular month grid of whole weeks', () => {
    const feb = monthGrid('2027-02'); // 1 Feb 2027 is a Monday, 28 Feb a Sunday → exactly 4 weeks
    expect(feb).toHaveLength(4);
    expect(feb[0]![0]).toBe('2027-02-01');
    expect(feb[3]![6]).toBe('2027-02-28');
    const dec = monthGrid('2030-12'); // Sun 1 Dec → grid starts Mon 25 Nov, ends Sun 5 Jan
    expect(dec[0]![0]).toBe('2030-11-25');
    expect(dec[dec.length - 1]![6]).toBe('2031-01-05');
    expect(dec.every((w) => w.length === 7)).toBe(true);
  });

  it('ranges per view and navigation', () => {
    expect(leaveCalendarRange('today', '2030-12-04')).toEqual({ from: '2030-12-04', to: '2030-12-04' });
    expect(leaveCalendarRange('week', '2030-12-04')).toEqual({ from: '2030-12-02', to: '2030-12-08' });
    expect(leaveCalendarRange('month', '2030-12-17')).toEqual({ from: '2030-11-25', to: '2031-01-05' });
    expect(shiftLeaveCalendarAnchor('today', '2030-12-31', 1)).toBe('2031-01-01');
    expect(shiftLeaveCalendarAnchor('week', '2030-12-04', -1)).toBe('2030-11-27');
    expect(shiftLeaveCalendarAnchor('month', '2030-01-31', -1)).toBe('2029-12-01');
    expect(shiftLeaveCalendarAnchor('month', '2030-12-15', 1)).toBe('2031-01-01');
  });

  it('every month view fits in the API range limit', () => {
    for (let m = 1; m <= 12; m++) {
      const { from, to } = leaveCalendarRange('month', `2031-${String(m).padStart(2, '0')}-01`);
      expect(leaveCalendarRangeTooLong(from, to)).toBe(false);
    }
    expect(leaveCalendarRangeTooLong('2030-01-01', '2030-03-03')).toBe(false); // 62 days
    expect(leaveCalendarRangeTooLong('2030-01-01', '2030-03-04')).toBe(true);
    expect(LEAVE_CALENDAR_MAX_DAYS).toBe(62);
  });

  it('finds the entries covering a date', () => {
    const entries = [
      { id: 'a', startDate: '2030-12-02', endDate: '2030-12-04' },
      { id: 'b', startDate: '2030-12-04', endDate: '2030-12-04' },
      { id: 'c', startDate: '2030-12-05', endDate: '2030-12-06' },
    ];
    expect(entriesOnDate(entries, '2030-12-04').map((e) => e.id)).toEqual(['a', 'b']);
    expect(entriesOnDate(entries, '2030-12-07')).toEqual([]);
    const day = leaveCalendarDay({ entries, holidays: [{ date: '2030-12-04', nameEn: 'H' }], restDays: ['2030-12-08'] }, '2030-12-04');
    expect(day).toMatchObject({ date: '2030-12-04', isRestDay: false, holidays: [{ nameEn: 'H' }] });
    expect(day.entries).toHaveLength(2);
    expect(leaveCalendarDay({ entries, holidays: [], restDays: ['2030-12-08'] }, '2030-12-08').isRestDay).toBe(true);
  });

  it('response schema accepts a hidden leave type', () => {
    const parsed = leaveCalendarResponseSchema.parse({
      from: '2030-12-02',
      to: '2030-12-08',
      today: '2030-12-04',
      entries: [
        { requestId: 'r', employeeId: 'e', employeeName: 'A B', departmentId: null, startDate: '2030-12-04', endDate: '2030-12-04', halfDay: 'AM', status: 'APPROVED', leaveType: null },
      ],
      holidays: [{ date: '2030-12-02', nameLo: 'ວັນຊາດ', nameEn: 'National Day', womenOnly: false, nationality: null }],
      restDays: ['2030-12-08'],
      viewer: { canSeeTypes: false, canSeePending: false, canFilter: false, allDepartments: false },
    });
    expect(parsed.entries[0]!.leaveType).toBeNull();
  });
});
