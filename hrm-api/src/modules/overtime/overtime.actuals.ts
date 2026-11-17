import { addDays, periodOverlap, totalOvertimeMinutes, type Period } from '@hrm/shared';
import type { Tx } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { workspaceTimeZone } from '../attendance/day-context';
import { parameterReader } from '../parameters/parameters.service';
import { splitForEmployee } from './overtime.calc';
import { overtimeRepository as repo } from './overtime.repository';

const MS_PER_MINUTE = 60_000;

/**
 * Settle the actual period of approved planned (PRE) OT from attendance (FR-ATT-21: categories from real time).
 *
 * Rule: once the planned end plus `attendance.missingPunchAfterMinutes` has passed (the same point at which a day's
 * punches are final), the worked time is the first IN → last OUT of the `AttendanceDay` of the OT's work date and
 * of the day before (a night shift's early-morning OT belongs to the shift's start day). The actual period is the
 * overlap of the approved window with that worked time — OT is never longer than approved — and is re-split into
 * the four categories. No overlap = 0 minutes. Without a complete IN/OUT pair the request keeps its planned values
 * until punches (or a correction) arrive and a later run settles it. POST requests are filed with their actual
 * times and need no settling. Returns the number of requests settled.
 */
export const settleOvertimeActuals = async (tx: Tx, workspaceId: string, now: Date = new Date(), ids?: string[]): Promise<number> => {
  const candidates = await repo.unsettledApproved(tx, workspaceId, now, ids);
  if (!candidates.length) return 0;
  const timeZone = await workspaceTimeZone(tx, workspaceId);
  let settled = 0;

  for (const ot of candidates) {
    const workDate = toIsoDate(ot.workDate)!;
    const finalAfter = await parameterReader.workspace(tx, workspaceId, 'attendance.missingPunchAfterMinutes', ot.workDate);
    if (now.getTime() < ot.plannedEnd.getTime() + finalAfter * MS_PER_MINUTE) continue;

    const days = await tx.attendanceDay.findMany({
      where: { workspaceId, employeeId: ot.employeeId, workDate: { in: [parseIsoDate(addDays(workDate, -1)), ot.workDate] } },
      select: { firstInAt: true, lastOutAt: true },
    });
    const worked = days.flatMap((d): Period[] => (d.firstInAt && d.lastOutAt && d.lastOutAt > d.firstInAt ? [{ start: d.firstInAt, end: d.lastOutAt }] : []));
    if (!worked.length) continue;

    const planned = { start: ot.plannedStart, end: ot.plannedEnd };
    const overlaps = worked.flatMap((w) => periodOverlap(planned, w) ?? []);
    const actual: Period = overlaps.length
      ? { start: new Date(Math.min(...overlaps.map((o) => o.start.getTime()))), end: new Date(Math.max(...overlaps.map((o) => o.end.getTime()))) }
      : { start: ot.plannedStart, end: ot.plannedStart };
    const split = await splitForEmployee(tx, workspaceId, ot.employeeId, workDate, actual, timeZone);
    await tx.overtimeRequest.update({
      where: { id: ot.id },
      data: { actualStart: actual.start, actualEnd: actual.end, ...split, minutes: totalOvertimeMinutes(split) },
    });
    settled++;
  }
  return settled;
};
