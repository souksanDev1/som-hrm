import { computeAttendanceDay, punchCounts, type AttendanceDayResult } from '@hrm/shared';
import type { Tx } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { parameterReader } from '../parameters/parameters.service';
import { loadEmployeeDays, workspaceTimeZone, type DayContextMemo } from './day-context';

/**
 * Rebuild `AttendanceDay` for one employee on the given work dates (FR-ATT-18) from the counted punches, the
 * schedule/roster, holidays and approved leave. Called after any punch, correction, review decision or schedule
 * change touching those dates, and by the daily job. A day that is too early to judge (no punch yet, before the
 * missing-punch cutoff) has no row. Returns the stored results by date.
 */
export const recomputeAttendanceDays = async (
  tx: Tx,
  workspaceId: string,
  employeeId: string,
  dates: readonly string[],
  now: Date = new Date(),
  /** Reads already made in this operation (see createPunches). */
  memo?: DayContextMemo,
): Promise<Map<string, AttendanceDayResult>> => {
  const unique = [...new Set(dates)].sort();
  const results = new Map<string, AttendanceDayResult>();
  if (!unique.length) return results;

  const [timeZone, days, punches, leaves] = await Promise.all([
    memo ? memo.timeZone() : workspaceTimeZone(tx, workspaceId),
    memo ? memo.days(employeeId, unique) : loadEmployeeDays(tx, workspaceId, employeeId, unique),
    tx.attendancePunch.findMany({
      where: { workspaceId, employeeId, workDate: { in: unique.map(parseIsoDate) } },
      select: { id: true, kind: true, capturedAt: true, workDate: true, reviewStatus: true, supersededAt: true },
    }),
    tx.leaveRequest.findMany({
      where: { workspaceId, employeeId, status: 'APPROVED', startDate: { lte: parseIsoDate(unique[unique.length - 1]!) }, endDate: { gte: parseIsoDate(unique[0]!) } },
      select: { startDate: true, endDate: true },
    }),
  ]);

  for (const date of unique) {
    const day = days.get(date)!;
    const at = parseIsoDate(date);
    const {
      'attendance.lateGraceMinutes': lateGrace,
      'attendance.earlyGraceMinutes': earlyGrace,
      'attendance.missingPunchAfterMinutes': missingAfter,
    } = await parameterReader.workspaceMany(
      tx,
      workspaceId,
      ['attendance.lateGraceMinutes', 'attendance.earlyGraceMinutes', 'attendance.missingPunchAfterMinutes'],
      at,
    );
    const result = computeAttendanceDay({
      workDate: date,
      timeZone,
      shift: day.shift,
      scheduledMinutes: day.scheduledMinutes,
      isHoliday: day.isHoliday,
      onLeave: leaves.some((l) => toIsoDate(l.startDate)! <= date && date <= toIsoDate(l.endDate)!),
      punches: punches.filter((p) => toIsoDate(p.workDate) === date && punchCounts(p)),
      lateGraceMinutes: day.shift?.lateGraceMinutes ?? lateGrace,
      earlyGraceMinutes: day.shift?.earlyGraceMinutes ?? earlyGrace,
      missingPunchAfterMinutes: missingAfter,
      now,
    });
    results.set(date, result);
    const key = { employeeId_workDate: { employeeId, workDate: at } };
    if (result.status === null) {
      await tx.attendanceDay.deleteMany({ where: { workspaceId, employeeId, workDate: at } });
      continue;
    }
    const data = {
      shiftId: day.shift?.id ?? null,
      scheduledStart: result.scheduledStart,
      scheduledEnd: result.scheduledEnd,
      scheduledMinutes: result.scheduledMinutes,
      firstInPunchId: result.firstInPunchId,
      lastOutPunchId: result.lastOutPunchId,
      firstInAt: result.firstInAt,
      lastOutAt: result.lastOutAt,
      lateMinutes: result.lateMinutes,
      earlyLeaveMinutes: result.earlyLeaveMinutes,
      workedMinutes: result.workedMinutes,
      status: result.status,
      computedAt: now,
    };
    await tx.attendanceDay.upsert({ where: key, create: { workspaceId, employeeId, workDate: at, ...data }, update: data });
  }
  return results;
};
