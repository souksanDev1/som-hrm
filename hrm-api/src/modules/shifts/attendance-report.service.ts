import {
  addDays,
  ATTENDANCE_DAY_STATUSES,
  formatTimeOfDay,
  localDateTimeOf,
  ATTENDANCE_DAYS_MAX_DAYS,
  type AttendanceDayList,
  type AttendanceDaysQuery,
  type AttendanceStatus,
  type AttendanceSummary,
  type AttendanceSummaryQuery,
} from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { badRequest } from '../../lib/errors';
import { workspaceTimeZone } from '../attendance/day-context';
import type { AuthContext } from '../auth/auth.service';
import { assertInScope, attendanceScope, datesBetween, employeeName } from './attendance-scope';
import { shiftsRepository as repo, type AttendanceDayRow } from './shifts.repository';

const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

/** Workspace-local "HH:mm" of an instant, suffixed " +N" when it falls N days after the work date. */
export const localClock = (instant: Date | null, timeZone: string, workDate: string): string | null => {
  if (!instant) return null;
  const local = localDateTimeOf(instant, timeZone);
  let offset = 0;
  while (offset < 3 && addDays(workDate, offset) < local.date) offset++;
  return `${formatTimeOfDay(local.minuteOfDay)}${offset ? ` +${offset}` : ''}`;
};

/** Last day of a "YYYY-MM" month. */
const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
};

/**
 * Read side of the attendance calculation (FR-ATT-18): computed `AttendanceDay` rows for web and mobile. The
 * calculation itself lives in modules/attendance (`recomputeAttendanceDays`); this only reads, within the
 * caller's attendance scope (`attendanceScope`).
 */
export const createAttendanceReportService = (db: Db) => {
  /** Where-clause for the caller's scope, narrowed to one employee/department when asked. */
  const scopedWhere = async (
    tx: Tx,
    ctx: AuthContext,
    q: { from: string; to: string; employeeId?: string; departmentId?: string; status?: AttendanceStatus },
  ): Promise<Prisma.AttendanceDayWhereInput> => {
    const scope = await attendanceScope(tx, ctx);
    if (q.employeeId) assertInScope(scope, q.employeeId);
    const employeeIds = q.employeeId ? [q.employeeId] : scope;
    return {
      workspaceId: ctx.workspaceId,
      workDate: { gte: parseIsoDate(q.from), lte: parseIsoDate(q.to) },
      ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      ...(q.departmentId ? { employee: { departmentId: q.departmentId } } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
  };

  return {
    async listDays(ctx: AuthContext, q: AttendanceDaysQuery): Promise<AttendanceDayList> {
      if (datesBetween(q.from, q.to).length > ATTENDANCE_DAYS_MAX_DAYS) {
        throw badRequest('range_too_long', { field: 'to', maxDays: ATTENDANCE_DAYS_MAX_DAYS });
      }
      return db.tenant(ctx.workspaceId, async (tx) => {
        const rows: AttendanceDayRow[] = await repo.days(tx, await scopedWhere(tx, ctx, q));
        const timeZone = await workspaceTimeZone(tx, ctx.workspaceId);
        const shifts = new Map(
          (await repo.shiftsByIds(tx, ctx.workspaceId, [...new Set(rows.flatMap((r) => (r.shiftId ? [r.shiftId] : [])))])).map((s) => [s.id, s]),
        );
        return {
          items: rows.map((r) => {
            const shift = r.shiftId ? shifts.get(r.shiftId) : undefined;
            const workDate = toIsoDate(r.workDate)!;
            return {
              id: r.id,
              employeeId: r.employeeId,
              employeeCode: r.employee.employeeCode,
              employeeName: employeeName(r.employee),
              departmentName: r.employee.department?.name ?? null,
              workDate,
              shiftId: r.shiftId,
              shiftName: shift?.name ?? null,
              shiftCode: shift?.code ?? null,
              shiftColor: shift?.color ?? null,
              scheduledStart: isoOrNull(r.scheduledStart),
              scheduledEnd: isoOrNull(r.scheduledEnd),
              scheduledMinutes: r.scheduledMinutes,
              firstInAt: isoOrNull(r.firstInAt),
              lastOutAt: isoOrNull(r.lastOutAt),
              scheduledStartLocal: localClock(r.scheduledStart, timeZone, workDate),
              scheduledEndLocal: localClock(r.scheduledEnd, timeZone, workDate),
              firstInLocal: localClock(r.firstInAt, timeZone, workDate),
              lastOutLocal: localClock(r.lastOutAt, timeZone, workDate),
              lateMinutes: r.lateMinutes,
              earlyLeaveMinutes: r.earlyLeaveMinutes,
              workedMinutes: r.workedMinutes,
              status: r.status,
              computedAt: r.computedAt.toISOString(),
            };
          }),
        };
      });
    },

    /** Month totals: days per status and late / early-leave / worked minutes, for one employee or the whole scope. */
    async summary(ctx: AuthContext, q: AttendanceSummaryQuery): Promise<AttendanceSummary> {
      const { from, to } = monthRange(q.month);
      return db.tenant(ctx.workspaceId, async (tx) => {
        const where = await scopedWhere(tx, ctx, { from, to, employeeId: q.employeeId });
        const [groups, totals] = await Promise.all([
          tx.attendanceDay.groupBy({ by: ['status'], where, _count: { _all: true } }),
          tx.attendanceDay.aggregate({ where, _count: { _all: true }, _sum: { lateMinutes: true, earlyLeaveMinutes: true, workedMinutes: true } }),
        ]);
        const counts = Object.fromEntries(ATTENDANCE_DAY_STATUSES.map((s) => [s, 0])) as Record<AttendanceStatus, number>;
        for (const g of groups) counts[g.status] = g._count._all;
        return {
          month: q.month,
          from,
          to,
          employeeId: q.employeeId ?? null,
          days: totals._count._all,
          counts,
          lateMinutes: totals._sum.lateMinutes ?? 0,
          earlyLeaveMinutes: totals._sum.earlyLeaveMinutes ?? 0,
          workedMinutes: totals._sum.workedMinutes ?? 0,
        };
      });
    },
  };
};

export type AttendanceReportService = ReturnType<typeof createAttendanceReportService>;
