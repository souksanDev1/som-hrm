import type { Tx } from '../../db/client';

const assignmentInclude = { schedule: { select: { id: true, name: true, dayMinutes: true } } } as const;

/** Standard versions, override patterns and effective-dated employee assignments (FR-WS-03). */
export const schedulesRepository = {
  /** Every version of the workspace standard, oldest first. */
  listStandardVersions: (tx: Tx, workspaceId: string) =>
    tx.workSchedule.findMany({
      where: { workspaceId, isDefault: true, effectiveFrom: { not: null } },
      orderBy: { effectiveFrom: 'asc' },
    }),

  findStandardVersion: (tx: Tx, workspaceId: string, effectiveFrom: Date) =>
    tx.workSchedule.findFirst({ where: { workspaceId, isDefault: true, effectiveFrom } }),

  createSchedule: (
    tx: Tx,
    data: { workspaceId: string; name: string; dayMinutes: number[]; shiftId: string; isDefault: boolean; effectiveFrom?: Date; reason: string; createdById: string },
  ) => tx.workSchedule.create({ data }),

  /** Replace a not-yet-used standard version scheduled for the same date. */
  updateStandardVersion: (tx: Tx, id: string, data: { dayMinutes: number[]; reason: string; createdById: string }) =>
    tx.workSchedule.update({ where: { id }, data }),

  /** Assignments of the given employees (or all employees), oldest first. */
  listAssignments: (tx: Tx, workspaceId: string, employeeIds?: string[]) =>
    tx.scheduleAssignment.findMany({
      where: { workspaceId, ...(employeeIds ? { employeeId: { in: employeeIds } } : {}) },
      include: assignmentInclude,
      orderBy: { effectiveFrom: 'asc' },
    }),

  /** Set an employee's assignment from `effectiveFrom`, replacing one scheduled for the same date. */
  upsertAssignment: (
    tx: Tx,
    data: { workspaceId: string; employeeId: string; scheduleId: string | null; effectiveFrom: Date; reason: string; createdById: string },
  ) =>
    tx.scheduleAssignment.upsert({
      where: { employeeId_effectiveFrom: { employeeId: data.employeeId, effectiveFrom: data.effectiveFrom } },
      create: data,
      update: { scheduleId: data.scheduleId, reason: data.reason, createdById: data.createdById },
    }),

  employeesByIds: (tx: Tx, workspaceId: string, ids: string[]) =>
    tx.employee.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
      orderBy: { employeeCode: 'asc' },
    }),
};

export type StandardVersionRow = Awaited<ReturnType<typeof schedulesRepository.listStandardVersions>>[number];
export type AssignmentRow = Awaited<ReturnType<typeof schedulesRepository.listAssignments>>[number];
