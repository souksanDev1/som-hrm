import { alertThreshold, daysBetweenIsoDates, PERMISSIONS } from '@hrm/shared';
import type { Db } from '../../db/client';
import { DEFAULT_TIME_ZONE, parseIsoDate, todayInTimeZone, toIsoDate } from '../../lib/dates';
import { notificationsRepository } from '../../modules/notifications/notifications.repository';
import { notify } from '../../modules/notifications/notifications.service';
import { parameterReader } from '../../modules/parameters/parameters.service';

export interface ProbationEndingRunResult {
  employees: number;
  notifications: number;
}

const ENDED_STATUSES = ['RESIGNED', 'TERMINATED'] as const;

/**
 * Daily probation-ending alerts for one workspace (FR-NOTI-03.5, FR-OB-03).
 *
 * Thresholds come from the workspace parameter `probation.alertDays` (default 14/7) and "today" from the
 * workspace timezone. An employee whose `probationEndDate` is today or within a threshold notifies HR
 * (users holding employee.write) and the employee's manager's login, once per stage: the smallest
 * threshold the end date falls within. Employees without an end date (e.g. contract type PROBATION but no
 * date entered) are skipped — nothing is computed from the hire date. The dedupe key
 * `probation-end:{employeeId}:{endDate}:{threshold}` makes re-runs harmless; a new end date alerts again.
 */
export const runProbationEndingAlerts = (db: Db, workspaceId: string, now: Date = new Date()): Promise<ProbationEndingRunResult> =>
  db.tenant(workspaceId, async (tx) => {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
    if (!workspace) return { employees: 0, notifications: 0 };
    const today = todayInTimeZone(workspace.timezone || DEFAULT_TIME_ZONE, now);
    const thresholds = await parameterReader.workspace(tx, workspaceId, 'probation.alertDays', parseIsoDate(today));
    const horizon = new Date(parseIsoDate(today).getTime() + Math.max(...thresholds) * 86_400_000);

    const employees = await tx.employee.findMany({
      where: {
        workspaceId,
        probationEndDate: { gte: parseIsoDate(today), lte: horizon },
        status: { notIn: [...ENDED_STATUSES] },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        probationEndDate: true,
        manager: { select: { user: { select: { id: true, isActive: true } } } },
      },
    });
    if (employees.length === 0) return { employees: 0, notifications: 0 };

    const hrUserIds = await notificationsRepository.findUserIdsWithPermission(tx, workspaceId, PERMISSIONS.EMPLOYEE_WRITE);
    let notifications = 0;
    let alerted = 0;
    for (const emp of employees) {
      const endDate = toIsoDate(emp.probationEndDate)!;
      const days = daysBetweenIsoDates(today, endDate);
      const threshold = alertThreshold(days, thresholds);
      if (threshold === null) continue;
      alerted++;
      const managerUser = emp.manager?.user?.isActive ? [emp.manager.user.id] : [];
      const res = await notify(tx, {
        workspaceId,
        userIds: [...hrUserIds, ...managerUser],
        type: 'PROBATION_ENDING',
        titleKey: 'notif.probationEnding.title',
        bodyKey: 'notif.probationEnding.body',
        params: { employee: `${emp.firstName} ${emp.lastName}`, days, date: endDate },
        link: `/employees/${emp.id}`,
        dedupeKey: `probation-end:${emp.id}:${endDate}:${threshold}`,
        data: { employeeId: emp.id, probationEndDate: endDate },
      });
      notifications += res.created;
    }
    return { employees: alerted, notifications };
  });
