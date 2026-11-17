import { addDays, AttendanceStatus } from '@hrm/shared';
import type { Db } from '../../db/client';
import { DEFAULT_TIME_ZONE, parseIsoDate, todayInTimeZone, toIsoDate } from '../../lib/dates';
import { recomputeAttendanceDays } from '../../modules/attendance/attendance-days';
import { ACTIVE_STATUSES } from '../../modules/employees/employees.repository';
import { notify } from '../../modules/notifications/notifications.service';

export interface AttendanceDailyRunResult {
  employees: number;
  /** Work dates recalculated (employees × 2). */
  recomputed: number;
  /** Missing-punch alerts sent (days newly marked as notified). */
  notified: number;
}

const MISSING = [AttendanceStatus.MISSING_IN, AttendanceStatus.MISSING_OUT];

/**
 * Daily attendance calculation for one workspace (FR-ATT-18, FR-NOTI-03.3), run every 15 minutes.
 *
 * 1. Recompute yesterday and today (workspace time zone) for every employed employee, so days without any
 *    punch become ABSENT and an IN without OUT becomes MISSING_OUT once the shift end + the
 *    `attendance.missingPunchAfterMinutes` cutoff has passed (the calculation reads the parameter).
 * 2. Every MISSING_IN / MISSING_OUT day of those dates not yet alerted notifies the employee's login once
 *    (`MISSING_PUNCH`, deep link to their attendance) and is stamped `missingNotifiedAt`; the dedupe key keeps a
 *    re-run harmless even if the stamp were lost.
 */
export const runAttendanceDaily = (db: Db, workspaceId: string, now: Date = new Date()): Promise<AttendanceDailyRunResult> =>
  db.tenant(workspaceId, async (tx) => {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
    if (!workspace) return { employees: 0, recomputed: 0, notified: 0 };
    const today = todayInTimeZone(workspace.timezone || DEFAULT_TIME_ZONE, now);
    const dates = [addDays(today, -1), today];

    const employees = await tx.employee.findMany({
      where: { workspaceId, status: { in: [...ACTIVE_STATUSES] } },
      select: { id: true, hireDate: true },
    });
    let recomputed = 0;
    for (const e of employees) {
      // Days before the hire date are not judged (no ABSENT before someone started).
      const hired = toIsoDate(e.hireDate)!;
      const own = dates.filter((d) => d >= hired);
      if (!own.length) continue;
      await recomputeAttendanceDays(tx, workspaceId, e.id, own, now);
      recomputed += own.length;
    }

    const pending = await tx.attendanceDay.findMany({
      where: { workspaceId, status: { in: MISSING }, missingNotifiedAt: null, workDate: { in: dates.map(parseIsoDate) } },
      select: { id: true, employeeId: true, workDate: true, status: true, employee: { select: { user: { select: { id: true, isActive: true } } } } },
    });
    let notified = 0;
    for (const day of pending) {
      const date = toIsoDate(day.workDate)!;
      const user = day.employee.user?.isActive ? day.employee.user : null;
      if (user) {
        await notify(tx, {
          workspaceId,
          userIds: [user.id],
          type: 'MISSING_PUNCH',
          titleKey: 'notif.missingPunch.title',
          bodyKey: 'notif.missingPunch.body',
          params: { punch: { t: day.status === AttendanceStatus.MISSING_IN ? 'attendance.kind.IN' : 'attendance.kind.OUT' }, date },
          link: `/attendance/employees/${day.employeeId}`,
          dedupeKey: `missing-punch:${day.employeeId}:${date}:${day.status}`,
          data: { employeeId: day.employeeId, workDate: date, status: day.status },
        });
      }
      await tx.attendanceDay.update({ where: { id: day.id }, data: { missingNotifiedAt: now } });
      notified++;
    }
    return { employees: employees.length, recomputed, notified };
  });
