import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';
import { ACTIVE_STATUSES } from '../employees/employees.repository';

const employeeSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  department: { select: { name: true } },
} satisfies Prisma.EmployeeSelect;
export type RosterEmployeeRow = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

const dayInclude = {
  employee: { select: employeeSelect },
} satisfies Prisma.AttendanceDayInclude;
export type AttendanceDayRow = Prisma.AttendanceDayGetPayload<{ include: typeof dayInclude }>;

/** Shifts, roster rows and computed attendance days (FR-ATT-17/18). */
export const shiftsRepository = {
  list: (tx: Tx, workspaceId: string, activeOnly: boolean) =>
    tx.shift.findMany({ where: { workspaceId, ...(activeOnly ? { isActive: true } : {}) }, orderBy: [{ isActive: 'desc' }, { startTime: 'asc' }, { name: 'asc' }] }),

  findById: (tx: Tx, workspaceId: string, id: string) => tx.shift.findFirst({ where: { id, workspaceId } }),

  findByName: (tx: Tx, workspaceId: string, name: string) => tx.shift.findFirst({ where: { workspaceId, name } }),

  /** Ids (of `ids`) referenced by a work schedule, a roster row or a computed day — such shifts are only deactivated. */
  usedIds: async (tx: Tx, workspaceId: string, ids: string[]): Promise<Set<string>> => {
    if (!ids.length) return new Set();
    const [schedules, roster, days] = await Promise.all([
      tx.workSchedule.findMany({ where: { workspaceId, shiftId: { in: ids } }, select: { shiftId: true }, distinct: ['shiftId'] }),
      tx.shiftRoster.findMany({ where: { workspaceId, shiftId: { in: ids } }, select: { shiftId: true }, distinct: ['shiftId'] }),
      tx.attendanceDay.findMany({ where: { workspaceId, shiftId: { in: ids } }, select: { shiftId: true }, distinct: ['shiftId'] }),
    ]);
    return new Set([...schedules, ...roster, ...days].map((r) => r.shiftId!).filter(Boolean));
  },

  /** Employees currently employed among `scope` (null = workspace), optionally one department, by code. */
  rosterEmployees: (tx: Tx, workspaceId: string, scope: string[] | null, departmentId?: string) =>
    tx.employee.findMany({
      where: {
        workspaceId,
        status: { in: [...ACTIVE_STATUSES] },
        ...(scope ? { id: { in: scope } } : {}),
        ...(departmentId ? { departmentId } : {}),
      },
      select: employeeSelect,
      orderBy: { employeeCode: 'asc' },
    }),

  rosterRows: (tx: Tx, workspaceId: string, employeeIds: string[], from: Date, to: Date) =>
    tx.shiftRoster.findMany({ where: { workspaceId, employeeId: { in: employeeIds }, date: { gte: from, lte: to } } }),

  days: (tx: Tx, where: Prisma.AttendanceDayWhereInput) =>
    tx.attendanceDay.findMany({ where, include: dayInclude, orderBy: [{ workDate: 'asc' }, { employee: { employeeCode: 'asc' } }] }),

  shiftsByIds: (tx: Tx, workspaceId: string, ids: string[]) =>
    ids.length ? tx.shift.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, name: true, code: true, color: true } }) : Promise.resolve([]),
};
