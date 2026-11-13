import type { EmployeeListQuery } from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';

export const employeeSummaryInclude = {
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  user: { select: { id: true } },
} satisfies Prisma.EmployeeInclude;

export const employeeDetailInclude = {
  ...employeeSummaryInclude,
  manager: { select: { id: true, firstName: true, lastName: true } },
  documents: { orderBy: { expiresAt: 'asc' } },
  emergencyContacts: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeWithSummary = Prisma.EmployeeGetPayload<{ include: typeof employeeSummaryInclude }>;
export type EmployeeWithDetail = Prisma.EmployeeGetPayload<{ include: typeof employeeDetailInclude }>;

const ACTIVE_STATUSES = ['PROBATION', 'ACTIVE', 'ON_LEAVE'] as const;

export const employeesRepository = {
  list: async (tx: Tx, workspaceId: string, q: EmployeeListQuery) => {
    const search = q.search?.trim();
    const where: Prisma.EmployeeWhereInput = {
      workspaceId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...(q.nationalityType ? { nationalityType: q.nationalityType } : {}),
      ...(search
        ? {
            OR: [
              { employeeCode: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { nickname: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      tx.employee.findMany({
        where,
        include: employeeSummaryInclude,
        orderBy: { employeeCode: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      tx.employee.count({ where }),
    ]);
    return { items, total };
  },

  findDetail: (tx: Tx, workspaceId: string, id: string) =>
    tx.employee.findFirst({ where: { id, workspaceId }, include: employeeDetailInclude }),

  findById: (tx: Tx, workspaceId: string, id: string) => tx.employee.findFirst({ where: { id, workspaceId } }),

  create: (tx: Tx, data: Prisma.EmployeeUncheckedCreateInput) => tx.employee.create({ data }),

  update: (tx: Tx, id: string, data: Prisma.EmployeeUncheckedUpdateInput) => tx.employee.update({ where: { id }, data }),

  countActive: (tx: Tx, workspaceId: string) =>
    tx.employee.count({ where: { workspaceId, status: { in: [...ACTIVE_STATUSES] } } }),

  /** Returns the ids of the manager chain starting at `managerId` (bounded to avoid runaway loops). */
  managerChain: async (tx: Tx, workspaceId: string, managerId: string, limit = 50): Promise<string[]> => {
    const chain: string[] = [];
    let current: string | null = managerId;
    while (current && chain.length < limit && !chain.includes(current)) {
      chain.push(current);
      const row: { managerId: string | null } | null = await tx.employee.findFirst({
        where: { id: current, workspaceId },
        select: { managerId: true },
      });
      current = row?.managerId ?? null;
    }
    return chain;
  },

  refsExist: async (
    tx: Tx,
    workspaceId: string,
    refs: { branchId?: string; departmentId?: string; positionId?: string; managerId?: string },
  ) => {
    const checks = await Promise.all([
      refs.branchId ? tx.branch.count({ where: { id: refs.branchId, workspaceId } }) : 1,
      refs.departmentId ? tx.department.count({ where: { id: refs.departmentId, workspaceId } }) : 1,
      refs.positionId ? tx.position.count({ where: { id: refs.positionId, workspaceId } }) : 1,
      refs.managerId ? tx.employee.count({ where: { id: refs.managerId, workspaceId } }) : 1,
    ]);
    const names = ['branchId', 'departmentId', 'positionId', 'managerId'] as const;
    return names.filter((_, i) => checks[i] === 0);
  },

  createHistory: (tx: Tx, data: Prisma.EmploymentHistoryUncheckedCreateInput) => tx.employmentHistory.create({ data }),

  createDocument: (tx: Tx, data: Prisma.EmployeeDocumentUncheckedCreateInput) => tx.employeeDocument.create({ data }),
  deleteDocument: (tx: Tx, workspaceId: string, employeeId: string, id: string) =>
    tx.employeeDocument.deleteMany({ where: { id, employeeId, workspaceId } }),

  createContact: (tx: Tx, data: Prisma.EmergencyContactUncheckedCreateInput) => tx.emergencyContact.create({ data }),
  deleteContact: (tx: Tx, workspaceId: string, employeeId: string, id: string) =>
    tx.emergencyContact.deleteMany({ where: { id, employeeId, workspaceId } }),

  seatLimit: async (tx: Tx, workspaceId: string) => {
    const sub = await tx.subscription.findUnique({ where: { workspaceId } });
    return sub ? sub.seatLimit + sub.seatCredit : Number.POSITIVE_INFINITY;
  },

  findRoleByCode: (tx: Tx, workspaceId: string, code: string) =>
    tx.role.findUnique({ where: { workspaceId_code: { workspaceId, code } } }),

  createUser: (tx: Tx, data: Prisma.UserUncheckedCreateInput) => tx.user.create({ data }),
  findUserByEmployee: (tx: Tx, employeeId: string) => tx.user.findUnique({ where: { employeeId } }),
  updateUser: (tx: Tx, id: string, data: Prisma.UserUncheckedUpdateInput) => tx.user.update({ where: { id }, data }),
};
