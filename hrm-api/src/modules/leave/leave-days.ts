import { datesInRange, type LeaveDayInfo, type LeaveEmployee } from '@hrm/shared';
import type { Tx } from '../../db/client';
import { toIsoDate } from '../../lib/dates';
import { notFound } from '../../lib/errors';
import { loadEmployeeDays } from '../attendance/day-context';

/**
 * The employee's own view of each date from `from` to `to` (inclusive, workspace time zone) for leave counting
 * (FR-LV-03.3): a date is a working day when their schedule or roster has work on it and it is not one of their
 * holidays (8 March women only, nationality days — FR-WS-05). Same source as the attendance engine, so a day on
 * leave and a day judged by attendance always agree. Run inside the caller's tenant transaction.
 */
export const loadLeaveDays = async (tx: Tx, workspaceId: string, employeeId: string, from: string, to: string): Promise<LeaveDayInfo[]> => {
  const dates = datesInRange(from, to);
  if (!dates.length) return [];
  const days = await loadEmployeeDays(tx, workspaceId, employeeId, dates);
  return dates.map((date) => {
    const day = days.get(date)!;
    return { date, working: !day.isRestDay && !day.isHoliday };
  });
};

/** The employee facts leave rules need (gender, tenure, pay type, hazardous work — FR-LV-06). 404 when missing. */
export const loadLeaveEmployee = async (tx: Tx, workspaceId: string, employeeId: string): Promise<LeaveEmployee> => {
  const e = await tx.employee.findFirst({
    where: { workspaceId, id: employeeId },
    select: { gender: true, hireDate: true, payType: true, hazardousWork: true },
  });
  if (!e) throw notFound('employee_not_found');
  return { gender: e.gender, hireDate: toIsoDate(e.hireDate)!, payType: e.payType, hazardousWork: e.hazardousWork };
};
