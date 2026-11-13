import {
  buildOrgTree,
  type Branch,
  type CreateBranchInput,
  type CreateDepartmentInput,
  type CreatePositionInput,
  type Department,
  type OrgChartNode,
  type Position,
} from '@hrm/shared';
import type { Db, Tx } from '../../db/client';
import { isUniqueViolation } from '../../db/client';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { orgRepository as repo } from './org.repository';

type BranchRow = Awaited<ReturnType<typeof repo.createBranch>>;
type DepartmentRow = Awaited<ReturnType<typeof repo.createDepartment>>;

const toBranch = (b: BranchRow): Branch => ({
  id: b.id,
  name: b.name,
  address: b.address,
  latitude: b.latitude,
  longitude: b.longitude,
  geofenceRadius: b.geofenceRadius,
  employeeCount: b._count.employees,
});

const toDepartment = (d: DepartmentRow): Department => ({
  id: d.id,
  name: d.name,
  parentId: d.parentId,
  headEmployeeId: d.headEmployeeId,
  employeeCount: d._count.employees,
});

const toPosition = (p: { id: string; name: string; level: number }): Position => ({ id: p.id, name: p.name, level: p.level });

/** Translate unique-constraint errors into a stable 409. */
const guardUnique = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('name_taken');
    throw err;
  }
};

export const createOrgService = (db: Db) => {
  const audit = (tx: Tx, ctx: AuthContext, action: string, entity: string, entityId: string) =>
    auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action, entity, entityId });

  const assertDepartmentRefs = async (tx: Tx, ctx: AuthContext, input: Partial<CreateDepartmentInput>, selfId?: string) => {
    if (input.parentId) {
      if (!(await repo.departmentExists(tx, ctx.workspaceId, input.parentId))) throw badRequest('invalid_reference', { fields: ['parentId'] });
      if (selfId && (await repo.departmentParentChain(tx, ctx.workspaceId, input.parentId)).includes(selfId)) {
        throw badRequest('department_cycle');
      }
    }
    if (input.headEmployeeId && !(await repo.employeeExists(tx, ctx.workspaceId, input.headEmployeeId))) {
      throw badRequest('invalid_reference', { fields: ['headEmployeeId'] });
    }
  };

  /** Delete only when nothing references the record. */
  const safeDelete = async (inUse: number, del: () => Promise<{ count: number }>) => {
    if (inUse > 0) throw conflict('in_use');
    const { count } = await del();
    if (!count) throw notFound();
  };

  return {
    listBranches: (ctx: AuthContext) => db.tenant(ctx.workspaceId, async (tx) => (await repo.listBranches(tx, ctx.workspaceId)).map(toBranch)),
    createBranch: (ctx: AuthContext, input: CreateBranchInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const b = await guardUnique(() => repo.createBranch(tx, { ...input, workspaceId: ctx.workspaceId }));
        await audit(tx, ctx, 'branch.created', 'Branch', b.id);
        return toBranch(b);
      }),
    updateBranch: (ctx: AuthContext, id: string, input: Partial<CreateBranchInput>) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const b = await guardUnique(() => repo.updateBranch(tx, ctx.workspaceId, id, input));
        await audit(tx, ctx, 'branch.updated', 'Branch', id);
        return toBranch(b);
      }),
    deleteBranch: (ctx: AuthContext, id: string) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await safeDelete(await repo.branchInUse(tx, ctx.workspaceId, id), () => repo.deleteBranch(tx, ctx.workspaceId, id));
        await audit(tx, ctx, 'branch.deleted', 'Branch', id);
      }),

    listDepartments: (ctx: AuthContext) =>
      db.tenant(ctx.workspaceId, async (tx) => (await repo.listDepartments(tx, ctx.workspaceId)).map(toDepartment)),
    createDepartment: (ctx: AuthContext, input: CreateDepartmentInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await assertDepartmentRefs(tx, ctx, input);
        const d = await guardUnique(() => repo.createDepartment(tx, { ...input, workspaceId: ctx.workspaceId }));
        await audit(tx, ctx, 'department.created', 'Department', d.id);
        return toDepartment(d);
      }),
    updateDepartment: (ctx: AuthContext, id: string, input: Partial<CreateDepartmentInput>) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        if (input.parentId === id) throw badRequest('department_cycle');
        await assertDepartmentRefs(tx, ctx, input, id);
        const d = await guardUnique(() => repo.updateDepartment(tx, ctx.workspaceId, id, input));
        await audit(tx, ctx, 'department.updated', 'Department', id);
        return toDepartment(d);
      }),
    deleteDepartment: (ctx: AuthContext, id: string) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await safeDelete(await repo.departmentInUse(tx, ctx.workspaceId, id), () => repo.deleteDepartment(tx, ctx.workspaceId, id));
        await audit(tx, ctx, 'department.deleted', 'Department', id);
      }),

    listPositions: (ctx: AuthContext) => db.tenant(ctx.workspaceId, async (tx) => (await repo.listPositions(tx, ctx.workspaceId)).map(toPosition)),
    createPosition: (ctx: AuthContext, input: CreatePositionInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const p = await guardUnique(() => repo.createPosition(tx, { name: input.name, level: input.level ?? 0, workspaceId: ctx.workspaceId }));
        await audit(tx, ctx, 'position.created', 'Position', p.id);
        return toPosition(p);
      }),
    updatePosition: (ctx: AuthContext, id: string, input: Partial<CreatePositionInput>) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const p = await guardUnique(() => repo.updatePosition(tx, ctx.workspaceId, id, input));
        await audit(tx, ctx, 'position.updated', 'Position', id);
        return toPosition(p);
      }),
    deletePosition: (ctx: AuthContext, id: string) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await safeDelete(await repo.positionInUse(tx, ctx.workspaceId, id), () => repo.deletePosition(tx, ctx.workspaceId, id));
        await audit(tx, ctx, 'position.deleted', 'Position', id);
      }),

    orgChart: (ctx: AuthContext): Promise<OrgChartNode[]> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const rows = await repo.orgChartRows(tx, ctx.workspaceId);
        return buildOrgTree(
          rows.map((r) => ({
            id: r.id,
            managerId: r.managerId,
            node: {
              id: r.id,
              employeeCode: r.employeeCode,
              name: `${r.firstName} ${r.lastName}`,
              position: r.position?.name ?? null,
              department: r.department?.name ?? null,
            },
          })),
        );
      }),
  };
};
export type OrgService = ReturnType<typeof createOrgService>;
