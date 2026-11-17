import { checkPunchLocation, localDateTimeOf, nextPunchKind, type CheckinStatus, type PunchKind } from '@hrm/shared';
import type { FixState } from './location';
import type { QueuedPunch } from './queue';

/**
 * What the check-in screen shows about the location (FR-ATT-01/09/15). Display only: the API repeats every
 * check with the same shared function (`checkPunchLocation`) when the punch arrives.
 */
export type ZoneState =
  | { kind: 'disabled' }
  | { kind: 'denied' }
  | { kind: 'off' }
  | { kind: 'locating' }
  | { kind: 'mocked' }
  | { kind: 'lowAccuracy'; accuracyMetres: number }
  | { kind: 'inside'; distanceMetres: number | null }
  | { kind: 'noGeofence' }
  | { kind: 'outside'; distanceMetres: number }
  | { kind: 'outsideOffsite'; distanceMetres: number }
  /** No status known yet (first start offline): the punch is queued and checked by the server. */
  | { kind: 'unknown' };

/** States in which the punch button works. */
export const canPunch = (z: ZoneState): boolean => ['inside', 'noGeofence', 'outsideOffsite', 'unknown'].includes(z.kind);

export const zoneState = (status: CheckinStatus | null | undefined, fix: FixState): ZoneState => {
  if (status && !status.mobileEnabled) return { kind: 'disabled' };
  if (fix.kind === 'denied') return { kind: 'denied' };
  if (fix.kind === 'off') return { kind: 'off' };
  if (fix.kind === 'locating' || fix.kind === 'error') return { kind: 'locating' };
  if (fix.fix.mocked) return { kind: 'mocked' };
  if (!status?.branch) return { kind: 'unknown' };
  const result = checkPunchLocation(
    { point: fix.fix, accuracyMetres: fix.fix.accuracyMetres, maxAccuracyMetres: status.maxAccuracyMetres },
    status.branch,
    !!status.offsitePermission,
  );
  if (!result.ok) {
    if (result.error === 'attendance_low_accuracy') return { kind: 'lowAccuracy', accuracyMetres: Math.round(fix.fix.accuracyMetres ?? 0) };
    return { kind: 'outside', distanceMetres: result.distanceMetres ?? 0 };
  }
  if (result.outsideZone) return { kind: 'outsideOffsite', distanceMetres: result.distanceMetres ?? 0 };
  if (result.distanceMetres === null) return { kind: 'noGeofence' };
  return { kind: 'inside', distanceMetres: result.distanceMetres };
};

/**
 * The next punch the button offers: after the last unsent punch of today, else what the server says. Without
 * any status (first start offline) it starts with IN.
 */
export const nextKindFor = (status: CheckinStatus | null | undefined, queue: readonly QueuedPunch[], now: Date): PunchKind => {
  const tz = status?.timeZone ?? 'Asia/Vientiane';
  const today = localDateTimeOf(now, tz).date;
  const queuedToday = queue.filter((q) => q.status === 'pending' && localDateTimeOf(new Date(q.capturedAt), tz).date === today);
  const last = queuedToday[queuedToday.length - 1];
  if (last) return nextPunchKind(last.kind);
  return status?.nextKind ?? 'IN';
};

/** Local "HH:mm" of an ISO instant in the workspace zone. */
export const timeOf = (iso: string, timeZone: string): string => {
  const m = localDateTimeOf(new Date(iso), timeZone).minuteOfDay;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Local "YYYY-MM-DD HH:mm". */
export const dateTimeOf = (iso: string, timeZone: string): string => `${localDateTimeOf(new Date(iso), timeZone).date} ${timeOf(iso, timeZone)}`;
