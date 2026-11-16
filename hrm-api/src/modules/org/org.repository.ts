import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';

export const orgRepository = {
  /** Open items only unless `includeClosed` (closed ones stay for history but are hidden from pickers). */
  listBranches: (tx: Tx, workspaceId: string, includeClosed = false) =>
    tx.branch.findMany({
      where: { workspaceId, ...(includeClosed ? {} : { isActive: true }) },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { employees: true } } },
    }),
  findBranch: (tx: Tx, workspaceId: string, id: string) => tx.branch.findFirst({ where: { id, workspaceId } }),
  createBranch: (tx: Tx, data: Prisma.BranchUncheckedCreateInput) => tx.branch.create({ data, include: { _count: { select: { employees: true } } } }),
  updateBranch: (tx: Tx, workspaceId: string, id: string, data: Prisma.BranchUncheckedUpdateInput) =>
    tx.branch.update({ where: { id, workspaceId }, data, include: { _count: { select: { employees: true } } } }),
  deleteBranch: (tx: Tx, workspaceId: string, id: string) => tx.branch.deleteMany({ where: { id, workspaceId } }),
  branchInUse: (tx: Tx, workspaceId: string, id: string) => tx.employee.count({ where: { workspaceId, branchId: id } }),

  listDepartments: (tx: Tx, workspaceId: string, includeClosed = false) =>
    tx.department.findMany({
      where: { workspaceId, ...(includeClosed ? {} : { isActive: true }) },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { employees: true } } },
    }),
  findDepartment: (tx: Tx, workspaceId: string, id: string) => tx.department.findFirst({ where: { id, workspaceId } }),
  openChildDepartments: (tx: Tx, workspaceId: string, id: string) => tx.department.count({ where: { workspaceId, parentId: id, isActive: true } }),
  createDepartment: (tx: Tx, data: Prisma.DepartmentUncheckedCreateInput) =>
    tx.department.create({ data, include: { _count: { select: { employees: true } } } }),
  updateDepartment: (tx: Tx, workspaceId: string, id: string, data: Prisma.DepartmentUncheckedUpdateInput) =>
    tx.department.update({ where: { id, workspaceId }, data, include: { _count: { select: { employees: true } } } }),
  deleteDepartment: (tx: Tx, workspaceId: string, id: string) => tx.department.deleteMany({ where: { id, workspaceId } }),
  departmentInUse: async (tx: Tx, workspaceId: string, id: string) =>
    (await tx.employee.count({ where: { workspaceId, departmentId: id } })) +
    (await tx.department.count({ where: { workspaceId, parentId: id } })),
  /** A new parent must be open; closed departments only stay as history. */
  openDepartmentExists: (tx: Tx, workspaceId: string, id: string) => tx.department.count({ where: { workspaceId, id, isActive: true } }),
  /** Ids of `startId` and all its ancestors (one recursive query; UNION stops on corrupt cycles). */
  departmentParentChain: async (tx: Tx, workspaceId: string, startId: string): Promise<string[]> => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE chain AS (
        SELECT "id", "parentId" FROM "Department" WHERE "id" = ${startId} AND "workspaceId" = ${workspaceId}
        UNION
        SELECT d."id", d."parentId" FROM "Department" d JOIN chain c ON d."id" = c."parentId" WHERE d."workspaceId" = ${workspaceId}
      )
      SELECT "id" FROM chain`;
    return rows.map((r) => r.id);
  },
  employeeExists: (tx: Tx, workspaceId: string, id: string) => tx.employee.count({ where: { workspaceId, id } }),

  listPositions: (tx: Tx, workspaceId: string, includeClosed = false) =>
    tx.position.findMany({
      where: { workspaceId, ...(includeClosed ? {} : { isActive: true }) },
      orderBy: [{ isActive: 'desc' }, { level: 'desc' }, { name: 'asc' }],
    }),
  findPosition: (tx: Tx, workspaceId: string, id: string) => tx.position.findFirst({ where: { id, workspaceId } }),
  createPosition: (tx: Tx, data: Prisma.PositionUncheckedCreateInput) => tx.position.create({ data }),
  updatePosition: (tx: Tx, workspaceId: string, id: string, data: Prisma.PositionUpdateInput) =>
    tx.position.update({ where: { id, workspaceId }, data }),
  deletePosition: (tx: Tx, workspaceId: string, id: string) => tx.position.deleteMany({ where: { id, workspaceId } }),
  positionInUse: (tx: Tx, workspaceId: string, id: string) => tx.employee.count({ where: { workspaceId, positionId: id } }),

  orgChartRows: (tx: Tx, workspaceId: string) =>
    tx.employee.findMany({
      where: { workspaceId, status: { in: ['PROBATION', 'ACTIVE', 'ON_LEAVE'] } },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        managerId: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { employeeCode: 'asc' },
    }),
};
