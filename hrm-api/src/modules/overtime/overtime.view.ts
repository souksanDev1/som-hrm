import { formatTimeOfDay, localDateTimeOf, type OvertimeRequestView } from '@hrm/shared';
import { toIsoDate } from '../../lib/dates';
import type { OvertimeRow } from './overtime.repository';

const localTime = (d: Date, timeZone: string) => formatTimeOfDay(localDateTimeOf(d, timeZone).minuteOfDay);

/** API view of one OT request, with local "HH:mm" times in the workspace zone. */
export const toOvertimeView = (r: OvertimeRow, timeZone: string, approvalRequestId: string | null): OvertimeRequestView => ({
  id: r.id,
  employeeId: r.employeeId,
  employeeCode: r.employee.employeeCode,
  employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
  kind: r.kind,
  workDate: toIsoDate(r.workDate)!,
  plannedStart: r.plannedStart.toISOString(),
  plannedEnd: r.plannedEnd.toISOString(),
  plannedStartTime: localTime(r.plannedStart, timeZone),
  plannedEndTime: localTime(r.plannedEnd, timeZone),
  actualStart: r.actualStart?.toISOString() ?? null,
  actualEnd: r.actualEnd?.toISOString() ?? null,
  actualStartTime: r.actualStart ? localTime(r.actualStart, timeZone) : null,
  actualEndTime: r.actualEnd ? localTime(r.actualEnd, timeZone) : null,
  reason: r.reason,
  minutes: r.minutes,
  workdayDayMinutes: r.workdayDayMinutes,
  workdayNightMinutes: r.workdayNightMinutes,
  holidayDayMinutes: r.holidayDayMinutes,
  holidayNightMinutes: r.holidayNightMinutes,
  status: r.status,
  decidedAt: r.decidedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  approvalRequestId,
});
