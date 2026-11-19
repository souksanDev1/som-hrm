import type { EmployeeListQuery, ExpiringDocumentsQuery } from '@hrm/shared';
import type { EmploymentStatus, Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';

export const employeeSummaryInclude = {
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  user: { select: { id: true } },
} satisfies Prisma.EmployeeInclude;

export const employeeDetailInclude = {
  ...employeeSummaryInclude,
  manager: { select: { id: true, firstName: true, lastName: true, position: { select: { name: true } } } },
  documents: {
    orderBy: { expiresAt: 'asc' },
    include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } },
  },
  emergencyContacts: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeWithSummary = Prisma.EmployeeGetPayload<{ include: typeof employeeSummaryInclude }>;
export type EmployeeWithDetail = Prisma.EmployeeGetPayload<{ include: typeof employeeDetailInclude }>;

const expiringDocumentSelect = {
  id: true,
  type: true,
  number: true,
  expiresAt: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      firstNameEn: true,
      lastNameEn: true,
      branch: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.EmployeeDocumentSelect;
export type ExpiringDocumentRow = Prisma.EmployeeDocumentGetPayload<{ select: typeof expiringDocumentSelect }>;

/** Statuses that occupy a paid seat and may hold an active login. */
export const ACTIVE_STATUSES = ['PROBATION', 'ACTIVE', 'ON_LEAVE'] as const satisfies readonly EmploymentStatus[];
export const isActiveStatus = (s: EmploymentStatus): boolean => (ACTIVE_STATUSES as readonly EmploymentStatus[]).includes(s);

type RefIds = { branchId?: string | null; departmentId?: string | null; positionId?: string | null; managerId?: string | null };

export const employeesRepository = {
  /** `onlyIds` restricts the result to a data scope (null = whole workspace). */
  list: async (tx: Tx, workspaceId: string, q: EmployeeListQuery, onlyIds: string[] | null = null) => {
    const search = q.search?.trim();
    const where: Prisma.EmployeeWhereInput = {
      workspaceId,
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
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
              { firstNameEn: { contains: search, mode: 'insensitive' } },
              { lastNameEn: { contains: search, mode: 'insensitive' } },
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

  /**
   * `rootId` plus everyone reporting to it directly or indirectly (recursive CTE on managerId,
   * tenant-scoped). UNION de-duplicates rows, so a corrupt cycle still terminates.
   */
  reportingTreeIds: async (tx: Tx, workspaceId: string, rootId: string): Promise<string[]> => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE team AS (
        SELECT "id" FROM "Employee" WHERE "id" = ${rootId} AND "workspaceId" = ${workspaceId}
        UNION
        SELECT e."id" FROM "Employee" e JOIN team t ON e."managerId" = t."id" WHERE e."workspaceId" = ${workspaceId}
      )
      SELECT "id" FROM team`;
    return rows.map((r) => r.id);
  },

  /** True when `employeeId` appears in the manager chain that starts at `managerId` (one recursive query). */
  isInManagerChain: async (tx: Tx, workspaceId: string, managerId: string, employeeId: string): Promise<boolean> => {
    const rows = await tx.$queryRaw<{ found: boolean }[]>`
      WITH RECURSIVE chain AS (
        SELECT "id", "managerId" FROM "Employee" WHERE "id" = ${managerId} AND "workspaceId" = ${workspaceId}
        UNION
        SELECT e."id", e."managerId" FROM "Employee" e JOIN chain c ON e."id" = c."managerId" WHERE e."workspaceId" = ${workspaceId}
      )
      SELECT EXISTS (SELECT 1 FROM chain WHERE "id" = ${employeeId}) AS found`;
    return rows[0]?.found ?? false;
  },

  /** Serialise seat-consuming writes per workspace until the transaction ends (B7). */
  lockSeats: (tx: Tx, workspaceId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`,

  workspaceTimeZone: async (tx: Tx, workspaceId: string): Promise<string | null> =>
    (await tx.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } }))?.timezone ?? null,

  refsExist: async (
    tx: Tx,
    workspaceId: string,
    refs: RefIds,
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

  /** Which of the referenced org units (branch, department, position) are closed (`isActive = false`). */
  closedOrgUnits: async (tx: Tx, workspaceId: string, refs: Pick<RefIds, 'branchId' | 'departmentId' | 'positionId'>) => {
    const checks: [keyof typeof refs, Promise<number> | number][] = [
      ['branchId', refs.branchId ? tx.branch.count({ where: { id: refs.branchId, workspaceId, isActive: false } }) : 0],
      ['departmentId', refs.departmentId ? tx.department.count({ where: { id: refs.departmentId, workspaceId, isActive: false } }) : 0],
      ['positionId', refs.positionId ? tx.position.count({ where: { id: refs.positionId, workspaceId, isActive: false } }) : 0],
    ];
    const counts = await Promise.all(checks.map(([, c]) => c));
    return checks.filter((_, i) => counts[i]! > 0).map(([field]) => field);
  },

  /** Which of the given unique keys are already used by another employee of the workspace. */
  findUniqueConflicts: async (
    tx: Tx,
    workspaceId: string,
    excludeId: string | null,
    keys: { employeeCode?: string; idCardNoHash?: string | null; socialSecurityNoHash?: string | null },
  ) => {
    const or = (['employeeCode', 'idCardNoHash', 'socialSecurityNoHash'] as const)
      .filter((k) => keys[k])
      .map((k) => ({ [k]: keys[k] }) as Prisma.EmployeeWhereInput);
    if (!or.length) return [];
    const rows = await tx.employee.findMany({
      where: { workspaceId, OR: or, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { employeeCode: true, idCardNoHash: true, socialSecurityNoHash: true },
    });
    return (['employeeCode', 'idCardNoHash', 'socialSecurityNoHash'] as const).filter((k) => keys[k] && rows.some((r) => r[k] === keys[k]));
  },

  createHistory: (tx: Tx, data: Prisma.EmploymentHistoryUncheckedCreateInput) => tx.employmentHistory.create({ data }),
  listHistory: async (tx: Tx, workspaceId: string, employeeId: string, page: number, pageSize: number) => {
    const where = { workspaceId, employeeId };
    const [items, total] = await Promise.all([
      tx.employmentHistory.findMany({
        where,
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.employmentHistory.count({ where }),
    ]);
    return { items, total };
  },
  userNames: (tx: Tx, workspaceId: string, ids: string[]) =>
    tx.user.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, displayName: true } }),

  /** Current names of the org entities / managers referenced by history entries (id → name). */
  refNames: async (tx: Tx, workspaceId: string, ids: string[]): Promise<Map<string, string>> => {
    if (!ids.length) return new Map();
    const where = { workspaceId, id: { in: ids } };
    const [branches, departments, positions, employees] = await Promise.all([
      tx.branch.findMany({ where, select: { id: true, name: true } }),
      tx.department.findMany({ where, select: { id: true, name: true } }),
      tx.position.findMany({ where, select: { id: true, name: true } }),
      tx.employee.findMany({ where, select: { id: true, firstName: true, lastName: true } }),
    ]);
    return new Map([
      ...[...branches, ...departments, ...positions].map((r) => [r.id, r.name] as const),
      ...employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`] as const),
    ]);
  },

  /**
   * Documents that are expired or expire on/before `horizon` (FR-EMP-06), soonest first, for employees
   * who have not left. `onlyIds` restricts to a data scope (null = whole workspace).
   */
  listExpiringDocuments: async (
    tx: Tx,
    workspaceId: string,
    q: ExpiringDocumentsQuery,
    window: { today: Date; horizon: Date },
    onlyIds: string[] | null,
  ) => {
    const expiresAt: Prisma.DateTimeNullableFilter =
      q.status === 'EXPIRED' ? { lt: window.today } : q.status === 'EXPIRING' ? { gte: window.today, lte: window.horizon } : { not: null, lte: window.horizon };
    const where: Prisma.EmployeeDocumentWhereInput = {
      workspaceId,
      expiresAt,
      ...(q.type ? { type: q.type } : {}),
      employee: {
        status: { in: [...ACTIVE_STATUSES] },
        ...(q.branchId ? { branchId: q.branchId } : {}),
        ...(onlyIds ? { id: { in: onlyIds } } : {}),
      },
    };
    const [items, total] = await Promise.all([
      tx.employeeDocument.findMany({
        where,
        select: expiringDocumentSelect,
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      tx.employeeDocument.count({ where }),
    ]);
    return { items, total };
  },

  createDocument: (tx: Tx, data: Prisma.EmployeeDocumentUncheckedCreateInput) => tx.employeeDocument.create({ data }),
  deleteDocument: (tx: Tx, workspaceId: string, employeeId: string, id: string) =>
    tx.employeeDocument.deleteMany({ where: { id, employeeId, workspaceId } }),

  createContact: (tx: Tx, data: Prisma.EmergencyContactUncheckedCreateInput) => tx.emergencyContact.create({ data }),
  updateContact: (tx: Tx, workspaceId: string, employeeId: string, id: string, data: Prisma.EmergencyContactUncheckedUpdateManyInput) =>
    tx.emergencyContact.updateMany({ where: { id, employeeId, workspaceId }, data }),
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
  revokeRefreshTokens: (tx: Tx, userId: string) =>
    tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
};
