/**
 * Attendance calculation (TOR FR-ATT-07/15/17/18, A12/A13). Pure functions shared by the API (authoritative),
 * web and mobile (early feedback / display only).
 *
 * Time model: instants are UTC `Date`s; shift times are local "HH:mm" in the workspace time zone; work dates
 * are ISO calendar dates (YYYY-MM-DD) in that zone. A shift whose end is not after its start crosses midnight
 * (FR-ATT-17.2) and belongs to the work date it starts on.
 */
import { AttendanceStatus, PunchKind, PunchReviewStatus } from '../enums';
import { haversineMetres, hasGeofence, type GeoPoint, type Geofence } from './geo';
import { parseTimeOfDay } from './parameters';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 24 * 60;

// ─────────────────────────── Time-zone helpers ───────────────────────────

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const partsFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
};

export interface LocalDateTime {
  /** YYYY-MM-DD in the zone. */
  date: string;
  /** Minutes after local midnight (0–1439). */
  minuteOfDay: number;
}

/** Local calendar date and minute of `instant` in an IANA time zone. */
export const localDateTimeOf = (instant: Date, timeZone: string): LocalDateTime => {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(instant).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minuteOfDay: Number(p.hour) * 60 + Number(p.minute) };
};

/** Offset of `timeZone` from UTC at `instant`, in minutes (Asia/Vientiane = +420). */
const offsetMinutes = (instant: Date, timeZone: string): number => {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(instant).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / MS_PER_MINUTE);
};

/** Add whole days to an ISO date. */
export const addDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The UTC instant of local `isoDate` + `minuteOfDay` in `timeZone` (minuteOfDay may exceed 1439 = next days). */
export const zonedInstant = (isoDate: string, minuteOfDay: number, timeZone: string): Date => {
  const naive = Date.parse(`${isoDate}T00:00:00.000Z`) + minuteOfDay * MS_PER_MINUTE;
  // Two passes settle DST edges; zones without DST (Asia/Vientiane) settle on the first.
  let guess = naive - offsetMinutes(new Date(naive), timeZone) * MS_PER_MINUTE;
  guess = naive - offsetMinutes(new Date(guess), timeZone) * MS_PER_MINUTE;
  return new Date(guess);
};

/** Whole minutes from `a` to `b` (truncated toward zero). */
export const minutesBetween = (a: Date, b: Date): number => Math.trunc((b.getTime() - a.getTime()) / MS_PER_MINUTE);

// ─────────────────────────────── Shifts ───────────────────────────────

export interface ShiftTimes {
  /** Local "HH:mm". */
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

const timeOrThrow = (hhmm: string): number => {
  const m = parseTimeOfDay(hhmm);
  if (m === null) throw new RangeError(`Invalid shift time "${hhmm}"`);
  return m;
};

/** True when the shift ends on the next calendar day (end not after start, FR-ATT-17.2). */
export const shiftCrossesMidnight = (shift: Pick<ShiftTimes, 'startTime' | 'endTime'>): boolean =>
  timeOrThrow(shift.endTime) <= timeOrThrow(shift.startTime);

/** Span from shift start to end in minutes (break included). */
export const shiftSpanMinutes = (shift: Pick<ShiftTimes, 'startTime' | 'endTime'>): number => {
  const start = timeOrThrow(shift.startTime);
  const end = timeOrThrow(shift.endTime);
  return end > start ? end - start : end + MINUTES_PER_DAY - start;
};

/** Paid working minutes of a full shift: span minus break. */
export const shiftNetMinutes = (shift: ShiftTimes): number => Math.max(0, shiftSpanMinutes(shift) - shift.breakMinutes);

export type ShiftValidationError = 'shift_invalid_time' | 'shift_break_too_long';

/** Validate a shift definition; `null` when valid. The API is authoritative. */
export const validateShift = (shift: ShiftTimes): ShiftValidationError | null => {
  if (parseTimeOfDay(shift.startTime) === null || parseTimeOfDay(shift.endTime) === null) return 'shift_invalid_time';
  if (shift.startTime === shift.endTime) return 'shift_invalid_time';
  if (!Number.isInteger(shift.breakMinutes) || shift.breakMinutes < 0 || shift.breakMinutes >= shiftSpanMinutes(shift)) {
    return 'shift_break_too_long';
  }
  return null;
};

export interface ScheduledWindow {
  start: Date;
  end: Date;
  /** Paid minutes expected that day. */
  minutes: number;
  /** Whether the break falls inside the window (full shift); a shorter scheduled day has no break. */
  includesBreak: boolean;
}

/**
 * Scheduled start/end on `workDate` for `shift`, shortened when the work pattern schedules fewer minutes than a
 * full shift (e.g. a 4-hour Saturday on an 08:00–17:00 shift ends at 12:00, without a break).
 * `scheduledMinutes = null` means "the full shift" (rostered shifts).
 */
export const scheduledWindow = (
  workDate: string,
  shift: ShiftTimes,
  scheduledMinutes: number | null,
  timeZone: string,
): ScheduledWindow => {
  const startMinute = timeOrThrow(shift.startTime);
  const start = zonedInstant(workDate, startMinute, timeZone);
  const net = shiftNetMinutes(shift);
  if (scheduledMinutes === null || scheduledMinutes >= net) {
    return { start, end: zonedInstant(workDate, startMinute + shiftSpanMinutes(shift), timeZone), minutes: net, includesBreak: true };
  }
  return { start, end: zonedInstant(workDate, startMinute + scheduledMinutes, timeZone), minutes: scheduledMinutes, includesBreak: false };
};

/**
 * The work date a punch at `instant` belongs to (A12). Normally the local calendar date; a punch in the early
 * hours after a night shift that started the previous day belongs to that day, up to halfway between that
 * shift's end and the next shift's start (12 h after the end when no shift follows).
 *
 * `shiftOn(date)` returns the shift worked on a date (roster or schedule), or null on a day without one.
 */
export const workDateOf = (instant: Date, timeZone: string, shiftOn: (isoDate: string) => ShiftTimes | null): string => {
  const { date } = localDateTimeOf(instant, timeZone);
  const yesterday = addDays(date, -1);
  const prev = shiftOn(yesterday);
  if (!prev || !shiftCrossesMidnight(prev)) return date;
  const prevEnd = zonedInstant(yesterday, timeOrThrow(prev.startTime) + shiftSpanMinutes(prev), timeZone).getTime();
  const today = shiftOn(date);
  const nextStart = today ? zonedInstant(date, timeOrThrow(today.startTime), timeZone).getTime() : prevEnd + 24 * 60 * MS_PER_MINUTE;
  const cutoff = prevEnd + Math.max(0, nextStart - prevEnd) / 2;
  return instant.getTime() < cutoff ? yesterday : date;
};

// ─────────────────────────────── Punches ───────────────────────────────

export interface PunchLike {
  id: string;
  kind: PunchKind;
  capturedAt: Date;
  reviewStatus: PunchReviewStatus;
  supersededAt: Date | null;
}

/**
 * Whether a punch counts toward its day: not replaced by a correction (FR-ATT-19.3) and not rejected in review
 * (FR-ATT-14.2, FR-ATT-16.3). Punches still PENDING review count until rejected, so a flagged day is not shown
 * as absent; rejecting it triggers a recompute.
 */
export const punchCounts = (p: Pick<PunchLike, 'reviewStatus' | 'supersededAt'>): boolean =>
  p.supersededAt === null && p.reviewStatus !== PunchReviewStatus.REJECTED;

// ─────────────────────────── Day calculation ───────────────────────────

export interface AttendanceDayInput {
  workDate: string;
  timeZone: string;
  /** Shift worked that day (roster, else the schedule's shift); null = none. */
  shift: ShiftTimes | null;
  /**
   * Scheduled paid minutes from the work pattern (0 = rest day); null = the full shift (a rostered day).
   */
  scheduledMinutes: number | null;
  /** The day is a holiday for this employee (`holidayAppliesTo`). */
  isHoliday: boolean;
  /** Approved leave covers the day (M6 fills this; half days are a later refinement). */
  onLeave: boolean;
  /** Counted punches of the day (`punchCounts`), any order. */
  punches: readonly Pick<PunchLike, 'id' | 'kind' | 'capturedAt'>[];
  /** Effective grace minutes (shift override, else the workspace parameter). */
  lateGraceMinutes: number;
  earlyGraceMinutes: number;
  /** Minutes after the scheduled end before missing punches/absence are final (`attendance.missingPunchAfterMinutes`). */
  missingPunchAfterMinutes: number;
  now: Date;
}

export interface AttendanceDayResult {
  /**
   * `null` = too early to judge: a working day with no punch yet, before the missing-punch cutoff. Nothing is
   * stored for it.
   */
  status: AttendanceStatus | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  scheduledMinutes: number;
  firstInPunchId: string | null;
  lastOutPunchId: string | null;
  firstInAt: Date | null;
  lastOutAt: Date | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
}

/**
 * One employee's work date (FR-ATT-18.1–18.5):
 * - late = minutes from scheduled start to first IN when more than the grace (`= grace` is on time);
 * - early leave = minutes from last OUT to scheduled end when more than the early grace;
 * - MISSING_IN when there are OUT punches but no IN; MISSING_OUT when there is an IN but no later OUT once the
 *   cutoff (scheduled end + `missingPunchAfterMinutes`) has passed; ABSENT when nothing was punched by then;
 * - LEAVE / HOLIDAY / REST days keep that status whatever was punched (worked minutes still count for OT).
 * Status precedence on a working day: MISSING_* > LATE > EARLY > PRESENT.
 */
export const computeAttendanceDay = (input: AttendanceDayInput): AttendanceDayResult => {
  const ins = input.punches.filter((p) => p.kind === PunchKind.IN).sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const firstIn = ins[0] ?? null;
  const outs = input.punches
    .filter((p) => p.kind === PunchKind.OUT && (!firstIn || p.capturedAt.getTime() > firstIn.capturedAt.getTime()))
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const anyOut = input.punches.some((p) => p.kind === PunchKind.OUT);
  const lastOut = outs[outs.length - 1] ?? null;

  const working = !!input.shift && input.scheduledMinutes !== 0;
  const window = working ? scheduledWindow(input.workDate, input.shift!, input.scheduledMinutes, input.timeZone) : null;

  const span = firstIn && lastOut ? Math.max(0, minutesBetween(firstIn.capturedAt, lastOut.capturedAt)) : 0;
  // Break times are not recorded, so the break counts as taken when the worked span covers more than half the
  // full shift (e.g. 08:00–17:00 worked → 1 h off; a 4-hour stint → none). Half days have no break.
  const breakToDeduct =
    input.shift && (!window || window.includesBreak) && span > shiftSpanMinutes(input.shift) / 2 ? input.shift.breakMinutes : 0;
  const base: AttendanceDayResult = {
    status: null,
    scheduledStart: window?.start ?? null,
    scheduledEnd: window?.end ?? null,
    scheduledMinutes: window?.minutes ?? 0,
    firstInPunchId: firstIn?.id ?? null,
    lastOutPunchId: lastOut?.id ?? null,
    firstInAt: firstIn?.capturedAt ?? null,
    lastOutAt: lastOut?.capturedAt ?? null,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    workedMinutes: span - breakToDeduct,
  };

  if (input.onLeave) return { ...base, status: AttendanceStatus.LEAVE };
  if (input.isHoliday) return { ...base, status: AttendanceStatus.HOLIDAY };
  if (!window) return { ...base, status: AttendanceStatus.REST };

  const final = input.now.getTime() >= window.end.getTime() + input.missingPunchAfterMinutes * MS_PER_MINUTE;
  if (!firstIn) {
    if (anyOut) return { ...base, status: AttendanceStatus.MISSING_IN };
    return final ? { ...base, status: AttendanceStatus.ABSENT } : base;
  }

  const lateBy = minutesBetween(window.start, firstIn.capturedAt);
  const lateMinutes = lateBy > input.lateGraceMinutes ? lateBy : 0;
  const earlyBy = lastOut ? minutesBetween(lastOut.capturedAt, window.end) : 0;
  const earlyLeaveMinutes = earlyBy > input.earlyGraceMinutes ? earlyBy : 0;
  const result = { ...base, lateMinutes, earlyLeaveMinutes };

  if (!lastOut) return { ...result, status: final ? AttendanceStatus.MISSING_OUT : lateMinutes ? AttendanceStatus.LATE : AttendanceStatus.PRESENT };
  if (lateMinutes) return { ...result, status: AttendanceStatus.LATE };
  if (earlyLeaveMinutes) return { ...result, status: AttendanceStatus.EARLY };
  return { ...result, status: AttendanceStatus.PRESENT };
};

// ───────────────────────── Device time & suspicion ─────────────────────────

/** Why a punch is flagged for review (FR-ATT-07.2, FR-ATT-10.2). */
export const SuspicionReason = {
  /** Device clock differs from server time by more than the tolerance at submission. */
  DEVICE_TIME_SKEW: 'DEVICE_TIME_SKEW',
  /** Capture time is later than the device's own send time. */
  CAPTURED_IN_FUTURE: 'CAPTURED_IN_FUTURE',
  /** Rooted / jailbroken device (SHOULD, FR-ATT-10). */
  ROOTED: 'ROOTED',
  /** Inside the geofence but not on one of the branch's Wi-Fi networks (SHOULD, FR-ATT-12). */
  WIFI_MISMATCH: 'WIFI_MISMATCH',
} as const;
export type SuspicionReason = (typeof SuspicionReason)[keyof typeof SuspicionReason];

/**
 * Minutes between the device clock and the server clock at submission (FR-ATT-07.1): the device sends its own
 * clock (`deviceSentAt`) with each batch, so an offline punch captured days ago is still checked correctly.
 */
export const deviceTimeSkewMinutes = (deviceSentAt: Date, serverReceivedAt: Date): number =>
  Math.abs(serverReceivedAt.getTime() - deviceSentAt.getTime()) / MS_PER_MINUTE;

export interface SuspicionInput {
  capturedAt: Date;
  deviceSentAt: Date;
  serverReceivedAt: Date;
  /** `attendance.deviceTimeToleranceMinutes`. */
  toleranceMinutes: number;
  rooted?: boolean;
  /** See `isWifiMismatch`. */
  wifiMismatch?: boolean;
}

/** Reasons a punch is suspicious; empty when it is not. Skew strictly greater than the tolerance flags (TOR "> 5 minutes"). */
export const suspicionReasons = (input: SuspicionInput): SuspicionReason[] => {
  const reasons: SuspicionReason[] = [];
  if (deviceTimeSkewMinutes(input.deviceSentAt, input.serverReceivedAt) > input.toleranceMinutes) reasons.push(SuspicionReason.DEVICE_TIME_SKEW);
  if (input.capturedAt.getTime() - input.deviceSentAt.getTime() > input.toleranceMinutes * MS_PER_MINUTE) {
    reasons.push(SuspicionReason.CAPTURED_IN_FUTURE);
  }
  if (input.rooted) reasons.push(SuspicionReason.ROOTED);
  if (input.wifiMismatch) reasons.push(SuspicionReason.WIFI_MISMATCH);
  return reasons;
};

/** A BSSID (access point MAC address): six hex pairs separated by `:` or `-`. */
const MAC_ADDRESS = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const normalizeMac = (mac: string) => mac.trim().toLowerCase().replace(/-/g, ':');
/** Android may quote the SSID and reports `<unknown ssid>` without location permission. */
const normalizeSsid = (ssid: string | null | undefined): string | null => {
  const v = (ssid ?? '').trim().replace(/^"(.*)"$/, '$1').trim();
  return v && v !== '<unknown ssid>' ? v.toLowerCase() : null;
};

/**
 * Office Wi-Fi check (FR-ATT-12, SHOULD): true when the branch lists networks and the phone's Wi-Fi matches none
 * of them. An entry shaped like a MAC address is compared with the BSSID, any other with the SSID (trimmed,
 * case-insensitive). A phone off Wi-Fi or one that could not read its Wi-Fi (`null`) counts as not matching —
 * the punch is only flagged for review, never refused. An empty list turns the check off. Apply it to punches
 * inside the geofence only (off-site punches have their own approval).
 */
export const isWifiMismatch = (
  networks: readonly string[],
  observed: { ssid: string | null; bssid: string | null } | null | undefined,
): boolean => {
  if (!networks.length) return false;
  const ssid = normalizeSsid(observed?.ssid);
  const bssid = observed?.bssid && MAC_ADDRESS.test(observed.bssid.trim()) ? normalizeMac(observed.bssid) : null;
  const matches = networks.some((entry) => (MAC_ADDRESS.test(entry.trim()) ? bssid !== null && normalizeMac(entry) === bssid : ssid !== null && entry.trim().toLowerCase() === ssid));
  return !matches;
};

// ───────────────────────────── Location ─────────────────────────────

export type PunchLocationError = 'attendance_location_required' | 'attendance_low_accuracy' | 'attendance_outside_zone';

export interface PunchLocationInput {
  point: GeoPoint | null;
  accuracyMetres: number | null;
  /** `attendance.maxAccuracyMetres`. */
  maxAccuracyMetres: number;
}

export type PunchLocationResult =
  | { ok: true; distanceMetres: number | null; outsideZone: boolean }
  | { ok: false; error: PunchLocationError; distanceMetres: number | null };

/**
 * Geofence check for a mobile punch (FR-ATT-15). A branch without a geofence accepts any location. Outside the
 * zone is refused unless `offsiteAllowed` (an active off-site permission, FR-ATT-16.2) — then it passes with
 * `outsideZone: true` and needs a reason and manager approval.
 */
export const checkPunchLocation = (input: PunchLocationInput, branch: Geofence, offsiteAllowed: boolean): PunchLocationResult => {
  if (!input.point) return { ok: false, error: 'attendance_location_required', distanceMetres: null };
  if (input.accuracyMetres !== null && input.accuracyMetres > input.maxAccuracyMetres) {
    return { ok: false, error: 'attendance_low_accuracy', distanceMetres: null };
  }
  if (!hasGeofence(branch)) return { ok: true, distanceMetres: null, outsideZone: false };
  const exact = haversineMetres(input.point, branch);
  const distanceMetres = Math.round(exact);
  if (exact <= branch.geofenceRadius) return { ok: true, distanceMetres, outsideZone: false };
  return offsiteAllowed ? { ok: true, distanceMetres, outsideZone: true } : { ok: false, error: 'attendance_outside_zone', distanceMetres };
};
