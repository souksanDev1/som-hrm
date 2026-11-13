import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';

export const orgRepository = {
  listBranches: (tx: Tx, workspaceId: string) =>
    tx.branch.findMany({ where: { workspaceId, isActive: true }, orderBy: { name: 'asc' }, include: { _count: { select: { employees: true } } } }),
  createBranch: (tx: Tx, data: Prisma.BranchUncheckedCreateInput) => tx.branch.create({ data, include: { _count: { select: { employees: true } } } }),
  updateBranch: (tx: Tx, workspaceId: string, id: string, data: Prisma.BranchUpdateInput) =>
    tx.branch.update({ where: { id, workspaceId }, data, include: { _count: { select: { employees: true } } } }),
  deleteBranch: (tx: Tx, workspaceId: string, id: string) => tx.branch.deleteMany({ where: { id, workspaceId } }),
  branchInUse: (tx: Tx, workspaceId: string, id: string) => tx.employee.count({ where: { workspaceId, branchId: id } }),

  listDepartments: (tx: Tx, workspaceId: string) =>
    tx.department.findMany({ where: { workspaceId }, orderBy: { name: 'asc' }, include: { _count: { select: { employees: true } } } }),
  createDepartment: (tx: Tx, data: Prisma.DepartmentUncheckedCreateInput) =>
    tx.department.create({ data, include: { _count: { select: { employees: true } } } }),
  updateDepartment: (tx: Tx, workspaceId: string, id: string, data: Prisma.DepartmentUncheckedUpdateInput) =>
    tx.department.update({ where: { id, workspaceId }, data, include: { _count: { select: { employees: true } } } }),
  deleteDepartment: (tx: Tx, workspaceId: string, id: string) => tx.department.deleteMany({ where: { id, workspaceId } }),
  departmentInUse: async (tx: Tx, workspaceId: string, id: string) =>
    (await tx.employee.count({ where: { workspaceId, departmentId: id } })) +
    (await tx.department.count({ where: { workspaceId, parentId: id } })),
  departmentExists: (tx: Tx, workspaceId: string, id: string) => tx.department.count({ where: { workspaceId, id } }),
  departmentParentChain: async (tx: Tx, workspaceId: string, startId: string) => {
    const chain: string[] = [];
    let cur: string | null = startId;
    while (cur && !chain.includes(cur) && chain.length < 50) {
      chain.push(cur);
      const row: { parentId: string | null } | null = await tx.department.findFirst({ where: { id: cur, workspaceId }, select: { parentId: true } });
      cur = row?.parentId ?? null;
    }
    return chain;
  },
  employeeExists: (tx: Tx, workspaceId: string, id: string) => tx.employee.count({ where: { workspaceId, id } }),

  listPositions: (tx: Tx, workspaceId: string) => tx.position.findMany({ where: { workspaceId }, orderBy: [{ level: 'desc' }, { name: 'asc' }] }),
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
