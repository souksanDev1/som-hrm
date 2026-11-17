import { describe, expect, it } from 'vitest';
import {
  checkPunchLocation,
  computeAttendanceDay,
  formatTimeOfDay,
  localDateTimeOf,
  parseTimeOfDay,
  punchCounts,
  scheduledWindow,
  shiftCrossesMidnight,
  shiftNetMinutes,
  suspicionReasons,
  validateShift,
  workDateOf,
  zonedInstant,
  type AttendanceDayInput,
  type ShiftTimes,
} from '../src';

const TZ = 'Asia/Vientiane'; // UTC+7, no DST
const day: ShiftTimes = { startTime: '08:00', endTime: '17:00', breakMinutes: 60 };
const night: ShiftTimes = { startTime: '22:00', endTime: '06:00', breakMinutes: 60 };
/** Local Vientiane time → UTC instant. */
const at = (date: string, hhmm: string) => zonedInstant(date, parseTimeOfDay(hhmm)!, TZ);
let seq = 0;
const p = (kind: 'IN' | 'OUT', date: string, hhmm: string) => ({ id: `p${++seq}`, kind, capturedAt: at(date, hhmm) });

const base = (over: Partial<AttendanceDayInput> = {}): AttendanceDayInput => ({
  workDate: '2026-11-16', // Monday
  timeZone: TZ,
  shift: day,
  scheduledMinutes: 480,
  isHoliday: false,
  onLeave: false,
  punches: [],
  lateGraceMinutes: 5,
  earlyGraceMinutes: 0,
  missingPunchAfterMinutes: 120,
  now: at('2026-11-17', '09:00'),
  ...over,
});

describe('time-zone helpers', () => {
  it('converts local Vientiane time to UTC and back', () => {
    expect(at('2026-11-16', '08:00').toISOString()).toBe('2026-11-16T01:00:00.000Z');
    expect(localDateTimeOf(new Date('2026-11-16T18:30:00Z'), TZ)).toEqual({ date: '2026-11-17', minuteOfDay: 90 });
  });
  it('formats and parses HH:mm', () => {
    expect(formatTimeOfDay(1320)).toBe('22:00');
    expect(parseTimeOfDay('5:00')).toBe(300);
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('8am')).toBeNull();
  });
});

describe('shifts', () => {
  it('detects shifts crossing midnight (FR-ATT-17.2)', () => {
    expect(shiftCrossesMidnight(day)).toBe(false);
    expect(shiftCrossesMidnight(night)).toBe(true);
    expect(shiftNetMinutes(night)).toBe(420);
  });
  it('validates shift definitions', () => {
    expect(validateShift(day)).toBeNull();
    expect(validateShift({ ...day, endTime: '08:00' })).toBe('shift_invalid_time');
    expect(validateShift({ ...day, startTime: '25:00' })).toBe('shift_invalid_time');
    expect(validateShift({ ...day, breakMinutes: 540 })).toBe('shift_break_too_long');
  });
  it('ends a night shift on the next calendar day', () => {
    const w = scheduledWindow('2026-11-16', night, null, TZ);
    expect(w.start).toEqual(at('2026-11-16', '22:00'));
    expect(w.end).toEqual(at('2026-11-17', '06:00'));
  });
  it('shortens a half day without a break', () => {
    const w = scheduledWindow('2026-11-21', day, 240, TZ);
    expect(w.end).toEqual(at('2026-11-21', '12:00'));
    expect(w).toMatchObject({ minutes: 240, includesBreak: false });
  });
});

describe('workDateOf', () => {
  const nightEveryDay = () => night;
  it('puts early-morning punches of a night shift on the day it started', () => {
    expect(workDateOf(at('2026-11-17', '06:10'), TZ, nightEveryDay)).toBe('2026-11-16');
    // halfway between 06:00 end and 22:00 next start is 14:00
    expect(workDateOf(at('2026-11-17', '13:59'), TZ, nightEveryDay)).toBe('2026-11-16');
    expect(workDateOf(at('2026-11-17', '14:00'), TZ, nightEveryDay)).toBe('2026-11-17');
    expect(workDateOf(at('2026-11-17', '21:55'), TZ, nightEveryDay)).toBe('2026-11-17');
  });
  it('uses the calendar date for day shifts', () => {
    expect(workDateOf(at('2026-11-17', '07:55'), TZ, () => day)).toBe('2026-11-17');
    expect(workDateOf(at('2026-11-17', '00:30'), TZ, () => null)).toBe('2026-11-17');
  });
});

describe('computeAttendanceDay (FR-ATT-18)', () => {
  it('is on time at exactly the grace and late one minute after', () => {
    const onTime = computeAttendanceDay(base({ punches: [p('IN', '2026-11-16', '08:05'), p('OUT', '2026-11-16', '17:00')] }));
    expect(onTime).toMatchObject({ status: 'PRESENT', lateMinutes: 0, workedMinutes: 475 });
    const late = computeAttendanceDay(base({ punches: [p('IN', '2026-11-16', '08:06'), p('OUT', '2026-11-16', '17:00')] }));
    expect(late).toMatchObject({ status: 'LATE', lateMinutes: 6 });
  });
  it('flags early leave beyond the early grace', () => {
    const r = computeAttendanceDay(base({ punches: [p('IN', '2026-11-16', '07:58'), p('OUT', '2026-11-16', '16:30')] }));
    expect(r).toMatchObject({ status: 'EARLY', earlyLeaveMinutes: 30 });
    const graced = computeAttendanceDay(base({ earlyGraceMinutes: 30, punches: [p('IN', '2026-11-16', '07:58'), p('OUT', '2026-11-16', '16:30')] }));
    expect(graced).toMatchObject({ status: 'PRESENT', earlyLeaveMinutes: 0 });
  });
  it('uses the first IN and the last OUT', () => {
    const r = computeAttendanceDay(
      base({ punches: [p('OUT', '2026-11-16', '17:30'), p('IN', '2026-11-16', '08:20'), p('IN', '2026-11-16', '07:50'), p('OUT', '2026-11-16', '12:00')] }),
    );
    expect(r.firstInAt).toEqual(at('2026-11-16', '07:50'));
    expect(r.lastOutAt).toEqual(at('2026-11-16', '17:30'));
    expect(r.status).toBe('PRESENT');
  });
  it('waits before judging an in-progress day, then marks missing/absent (FR-ATT-18.3/18.4)', () => {
    const during = at('2026-11-16', '18:00');
    expect(computeAttendanceDay(base({ now: during })).status).toBeNull();
    expect(computeAttendanceDay(base({ now: during, punches: [p('IN', '2026-11-16', '08:00')] })).status).toBe('PRESENT');
    const cutoff = at('2026-11-16', '19:00'); // 17:00 + 120 min
    expect(computeAttendanceDay(base({ now: cutoff })).status).toBe('ABSENT');
    expect(computeAttendanceDay(base({ now: cutoff, punches: [p('IN', '2026-11-16', '08:00')] })).status).toBe('MISSING_OUT');
    expect(computeAttendanceDay(base({ now: during, punches: [p('OUT', '2026-11-16', '17:00')] })).status).toBe('MISSING_IN');
  });
  it('computes a night shift across midnight', () => {
    const r = computeAttendanceDay(
      base({ shift: night, scheduledMinutes: null, punches: [p('IN', '2026-11-16', '22:10'), p('OUT', '2026-11-17', '06:00')] }),
    );
    expect(r).toMatchObject({ status: 'LATE', lateMinutes: 10, earlyLeaveMinutes: 0, workedMinutes: 410 });
  });
  it('keeps holiday, rest and leave days whatever was punched', () => {
    const punches = [p('IN', '2026-11-16', '08:00'), p('OUT', '2026-11-16', '12:00')];
    expect(computeAttendanceDay(base({ isHoliday: true, punches })).status).toBe('HOLIDAY');
    expect(computeAttendanceDay(base({ scheduledMinutes: 0, punches })).status).toBe('REST');
    expect(computeAttendanceDay(base({ shift: null })).status).toBe('REST');
    expect(computeAttendanceDay(base({ onLeave: true })).status).toBe('LEAVE');
    expect(computeAttendanceDay(base({ isHoliday: true, punches })).workedMinutes).toBe(240);
  });
});

describe('punches', () => {
  it('ignores superseded and rejected punches', () => {
    expect(punchCounts({ reviewStatus: 'NONE', supersededAt: null })).toBe(true);
    expect(punchCounts({ reviewStatus: 'PENDING', supersededAt: null })).toBe(true);
    expect(punchCounts({ reviewStatus: 'REJECTED', supersededAt: null })).toBe(false);
    expect(punchCounts({ reviewStatus: 'NONE', supersededAt: new Date() })).toBe(false);
  });
  it('flags device time skew strictly over the tolerance (FR-ATT-07.2)', () => {
    const server = new Date('2026-11-16T01:00:00Z');
    const sent = (min: number) => new Date(server.getTime() - min * 60_000);
    const captured = new Date('2026-11-14T01:00:00Z'); // offline two days ago is fine
    expect(suspicionReasons({ capturedAt: captured, deviceSentAt: sent(5), serverReceivedAt: server, toleranceMinutes: 5 })).toEqual([]);
    expect(suspicionReasons({ capturedAt: captured, deviceSentAt: sent(5.5), serverReceivedAt: server, toleranceMinutes: 5 })).toEqual([
      'DEVICE_TIME_SKEW',
    ]);
    expect(
      suspicionReasons({ capturedAt: new Date(server.getTime() + 3_600_000), deviceSentAt: server, serverReceivedAt: server, toleranceMinutes: 5, rooted: true }),
    ).toEqual(['CAPTURED_IN_FUTURE', 'ROOTED']);
  });
});

describe('checkPunchLocation (FR-ATT-15/16)', () => {
  const branch = { latitude: 17.9757, longitude: 102.6331, geofenceRadius: 150 };
  const near = { latitude: 17.9758, longitude: 102.6332 };
  const far = { latitude: 17.99, longitude: 102.6331 };
  const loc = (point: typeof near | null, accuracyMetres: number | null = 10) => ({ point, accuracyMetres, maxAccuracyMetres: 100 });
  it('accepts inside the zone and refuses outside with the distance', () => {
    expect(checkPunchLocation(loc(near), branch, false)).toMatchObject({ ok: true, outsideZone: false });
    const r = checkPunchLocation(loc(far), branch, false);
    expect(r).toMatchObject({ ok: false, error: 'attendance_outside_zone' });
    expect(r.distanceMetres).toBeGreaterThan(1500);
  });
  it('lets an off-site permission through as an out-of-zone punch', () => {
    expect(checkPunchLocation(loc(far), branch, true)).toMatchObject({ ok: true, outsideZone: true });
  });
  it('requires a location and refuses poor accuracy', () => {
    expect(checkPunchLocation(loc(null), branch, true)).toMatchObject({ ok: false, error: 'attendance_location_required' });
    expect(checkPunchLocation(loc(near, 250), branch, false)).toMatchObject({ ok: false, error: 'attendance_low_accuracy' });
  });
  it('accepts anywhere for a branch without a geofence', () => {
    expect(checkPunchLocation(loc(far), { latitude: null, longitude: null, geofenceRadius: 150 }, false)).toMatchObject({ ok: true });
  });
});
