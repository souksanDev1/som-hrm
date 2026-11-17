/**
 * Mobile check-in helpers (FR-ATT-01/08). Pure functions used by the API (status) and the app (offline queue).
 */
import { PunchKind } from '../enums';

const MS_PER_HOUR = 3_600_000;

/** The punch the check-in button offers next: OUT after an IN, otherwise IN. */
export const nextPunchKind = (lastKind: PunchKind | null | undefined): PunchKind => (lastKind === PunchKind.IN ? PunchKind.OUT : PunchKind.IN);

/**
 * Unsent offline punches are overdue (FR-ATT-08, FR-NOTI-03.7) when the oldest one was captured at least
 * `alertHours` (`attendance.offlineAlertHours`) ago.
 */
export const isOfflineOverdue = (oldestCapturedAt: Date | null, now: Date, alertHours: number): boolean =>
  !!oldestCapturedAt && now.getTime() - oldestCapturedAt.getTime() >= alertHours * MS_PER_HOUR;
