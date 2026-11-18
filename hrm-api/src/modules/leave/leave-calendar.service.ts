import {
  datesInRange,
  leaveCalendarRangeTooLong,
  minutesToHours,
  PERMISSIONS,
  resolveStandardVersion,
  scheduledHoursOn,
  type LeaveCalendarEntry,
  type LeaveCalendarQuery,
  type LeaveCalendarResponse,
} from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import { parseIsoDate, toIsoDate, todayInTimeZone } from '../../lib/dates';
import { badRequest, forbidden } from '../../lib/errors';
import { workspaceTimeZone } from '../attendance/day-context';
import type { AuthContext } from '../auth/auth.service';
import { employeesRepository } from '../employees/employees.repository';
import { schedulesRepository } from '../schedules/schedules.repository';
import { employeeName } from '../shifts/attendance-scope';

type Access = Pick<AuthContext, 'workspaceId' | 'employeeId' | 'permissions'>;

const iso = (d: Date) => toIsoDate(d)!;

/**
 * Who the viewer sees on the leave calendar (FR-LV-13.1/13.4/13.9):
 * - `all`: HR (`leave.calendar.read_all`) — every employee, type + pending;
 * - `full`: employee ids shown in detail (type + pending) — the viewer and their whole reporting tree;
 * - `limited`: the rest of the viewer's department — approved leave only, type hidden (FR-LV-13.6/13.7).
 */
interface CalendarAudience {
  all: boolean;
  isManager: boolean;
  full: Set<string>;
  limited: Set<string>;
}

const audienceOf = async (tx: Tx, auth: Access): Promise<CalendarAudience> => {
  if (auth.permissions.includes(PERMISSIONS.LEAVE_CALENDAR_READ_ALL)) return { all: true, isManager: false, full: new Set(), limited: new Set() };
  if (!auth.employeeId) return { all: false, isManager: false, full: new Set(), limited: new Set() };
  const self = auth.employeeId;
  // Reporting tree = the viewer plus every level below (structure, not role — same as approvals).
  const full = new Set(await employeesRepository.reportingTreeIds(tx, auth.workspaceId, self));
  full.add(self);
  const me = await tx.employee.findFirst({ where: { workspaceId: auth.workspaceId, id: self }, select: { departmentId: true } });
  const colleagues = me?.departmentId
    ? await tx.employee.findMany({ where: { workspaceId: auth.workspaceId, departmentId: me.departmentId }, select: { id: true } })
    : [];
  const limited = new Set(colleagues.map((c) => c.id).filter((id) => !full.has(id)));
  return { all: false, isManager: full.size > 1, full, limited };
};

/** Dates in range that are rest days (0 scheduled hours) on the workspace standard schedule in force that day. */
const standardRestDays = async (tx: Tx, workspaceId: string, from: string, to: string): Promise<string[]> => {
  const versions = (await schedulesRepository.listStandardVersions(tx, workspaceId)).map((v) => ({
    id: v.id,
    effectiveFrom: iso(v.effectiveFrom!),
    dayHours: minutesToHours(v.dayMinutes),
  }));
  return datesInRange(from, to).filter((date) => {
    const version = resolveStandardVersion(versions, date);
    return !!version && scheduledHoursOn(version.dayHours, date) === 0;
  });
};

/**
 * Leave calendar (FR-LV-13): leave of the people the viewer may see over `from..to`, plus the workspace holidays
 * (8 March kept with its `womenOnly` flag) and weekly rest days of the standard schedule (FR-LV-13.8).
 * Cancelled and rejected requests never appear. Filters (FR-LV-13.5) are for managers and HR only.
 */
export const createLeaveCalendarService = (db: Db) => ({
  calendar: (auth: AuthContext, query: LeaveCalendarQuery): Promise<LeaveCalendarResponse> =>
    db.tenant(auth.workspaceId, async (tx) => {
      const { from, to, departmentId, leaveTypeId } = query;
      if (leaveCalendarRangeTooLong(from, to)) throw badRequest('leave_calendar_range_too_long');
      const ws = auth.workspaceId;
      const audience = await audienceOf(tx, auth);
      const canFilter = audience.all || audience.isManager;
      if ((departmentId || leaveTypeId) && !canFilter) throw forbidden('leave_calendar_filter_forbidden');

      const visibleIds = audience.all ? null : [...audience.full, ...audience.limited];
      const where: Prisma.LeaveRequestWhereInput = {
        workspaceId: ws,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: parseIsoDate(to) },
        endDate: { gte: parseIsoDate(from) },
        ...(visibleIds ? { employeeId: { in: visibleIds } } : {}),
        ...(departmentId ? { employee: { departmentId } } : {}),
        ...(leaveTypeId ? { leaveTypeId } : {}),
      };
      const [rows, holidays, restDays, timeZone] = await Promise.all([
        tx.leaveRequest.findMany({
          where,
          orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            employeeId: true,
            startDate: true,
            endDate: true,
            halfDay: true,
            status: true,
            employee: { select: { firstName: true, lastName: true, departmentId: true } },
            leaveType: { select: { id: true, nameLo: true, nameEn: true } },
          },
        }),
        tx.holiday.findMany({ where: { workspaceId: ws, date: { gte: parseIsoDate(from), lte: parseIsoDate(to) } }, orderBy: { date: 'asc' } }),
        standardRestDays(tx, ws, from, to),
        workspaceTimeZone(tx, ws),
      ]);

      const entries: LeaveCalendarEntry[] = [];
      for (const r of rows) {
        const detailed = audience.all || audience.full.has(r.employeeId);
        // Limited audience: approved only, and never matched by a type filter (that would reveal the type).
        if (!detailed && (r.status !== 'APPROVED' || leaveTypeId)) continue;
        entries.push({
          requestId: r.id,
          employeeId: r.employeeId,
          employeeName: employeeName(r.employee),
          departmentId: r.employee.departmentId,
          startDate: iso(r.startDate),
          endDate: iso(r.endDate),
          halfDay: r.halfDay,
          status: r.status,
          leaveType: detailed ? { id: r.leaveType.id, nameLo: r.leaveType.nameLo, nameEn: r.leaveType.nameEn } : null,
        });
      }

      return {
        from,
        to,
        today: todayInTimeZone(timeZone),
        entries,
        holidays: holidays.map((h) => ({ date: iso(h.date), nameLo: h.nameLo, nameEn: h.nameEn, womenOnly: h.womenOnly, nationality: h.nationality })),
        restDays,
        viewer: { canSeeTypes: canFilter, canSeePending: canFilter, canFilter, allDepartments: audience.all },
      };
    }),
});

export type LeaveCalendarService = ReturnType<typeof createLeaveCalendarService>;
