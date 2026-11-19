import {
  buildOrgStructure,
  buildOrgTree,
  type Branch,
  type CreateBranchInput,
  type CreateDepartmentInput,
  type CreatePositionInput,
  type Department,
  isGeofenceComplete,
  type OrgChartNode,
  type OrgListQuery,
  type OrgStructureNode,
  type Position,
  type UpdateBranchInput,
  type UpdateDepartmentInput,
} from '@hrm/shared';
import type { Prisma } from '@prisma/client';
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
  attendanceModes: b.attendanceModes,
  wifiNetworks: b.wifiNetworks,
  isActive: b.isActive,
  employeeCount: b._count.employees,
});

const toDepartment = (d: DepartmentRow): Department => ({
  id: d.id,
  name: d.name,
  parentId: d.parentId,
  headEmployeeId: d.headEmployeeId,
  isActive: d.isActive,
  employeeCount: d._count.employees,
});

const toPosition = (p: { id: string; name: string; level: number; isActive: boolean }): Position => ({
  id: p.id,
  name: p.name,
  level: p.level,
  isActive: p.isActive,
});

/** `{ field: { from, to } }` for every input field whose value differs from the stored row (audit meta). */
export const changedFields = (before: Record<string, unknown>, input: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> =>
  Object.fromEntries(
    Object.entries(input)
      .filter(([k, v]) => v !== undefined && (before[k] ?? null) !== (v ?? null))
      .map(([k, v]) => [k, { from: before[k] ?? null, to: v ?? null }]),
  );

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
  const audit = (tx: Tx, ctx: AuthContext, action: string, entity: string, entityId: string, meta?: Prisma.InputJsonValue) =>
    auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action, entity, entityId, meta });

  const found = <T>(row: T | null): T => {
    if (!row) throw notFound();
    return row;
  };

  const assertDepartmentRefs = async (tx: Tx, ctx: AuthContext, input: UpdateDepartmentInput, selfId?: string) => {
    if (input.parentId) {
      if (!(await repo.openDepartmentExists(tx, ctx.workspaceId, input.parentId))) throw badRequest('invalid_reference', { fields: ['parentId'] });
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
    listBranches: (ctx: AuthContext, query: OrgListQuery = {}) =>
      db.tenant(ctx.workspaceId, async (tx) => (await repo.listBranches(tx, ctx.workspaceId, query.includeClosed)).map(toBranch)),
    createBranch: (ctx: AuthContext, input: CreateBranchInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const b = await guardUnique(() => repo.createBranch(tx, { ...input, workspaceId: ctx.workspaceId }));
        await audit(tx, ctx, 'branch.created', 'Branch', b.id, { name: b.name, latitude: b.latitude, longitude: b.longitude, geofenceRadius: b.geofenceRadius });
        return toBranch(b);
      }),
    updateBranch: (ctx: AuthContext, id: string, input: UpdateBranchInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const before = found(await repo.findBranch(tx, ctx.workspaceId, id));
        // A PATCH may carry one coordinate; the stored geofence must stay complete (FR-WS-02.4).
        const merged = {
          latitude: input.latitude === undefined ? before.latitude : input.latitude,
          longitude: input.longitude === undefined ? before.longitude : input.longitude,
        };
        if (!isGeofenceComplete(merged)) throw badRequest('geofence_incomplete', { fields: ['latitude', 'longitude'] });
        const b = await guardUnique(() => repo.updateBranch(tx, ctx.workspaceId, id, input));
        await audit(tx, ctx, 'branch.updated', 'Branch', id, { changes: changedFields(before, input) } as Prisma.InputJsonValue);
        return toBranch(b);
      }),
    setBranchActive: (ctx: AuthContext, id: string, isActive: boolean) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const before = found(await repo.findBranch(tx, ctx.workspaceId, id));
        const b = await repo.updateBranch(tx, ctx.workspaceId, id, { isActive });
        if (before.isActive !== isActive) await audit(tx, ctx, isActive ? 'branch.reopened' : 'branch.closed', 'Branch', id, { name: b.name });
        return toBranch(b);
      }),
    deleteBranch: (ctx: AuthContext, id: string) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await safeDelete(await repo.branchInUse(tx, ctx.workspaceId, id), () => repo.deleteBranch(tx, ctx.workspaceId, id));
        await audit(tx, ctx, 'branch.deleted', 'Branch', id);
      }),

    listDepartments: (ctx: AuthContext, query: OrgListQuery = {}) =>
      db.tenant(ctx.workspaceId, async (tx) => (await repo.listDepartments(tx, ctx.workspaceId, query.includeClosed)).map(toDepartment)),
    createDepartment: (ctx: AuthContext, input: CreateDepartmentInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await assertDepartmentRefs(tx, ctx, input);
        const d = await guardUnique(() => repo.createDepartment(tx, { ...input, workspaceId: ctx.workspaceId }));
        await audit(tx, ctx, 'department.created', 'Department', d.id, { name: d.name, parentId: d.parentId });
        return toDepartment(d);
      }),
    updateDepartment: (ctx: AuthContext, id: string, input: UpdateDepartmentInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        if (input.parentId === id) throw badRequest('department_cycle');
        const before = found(await repo.findDepartment(tx, ctx.workspaceId, id));
        // Re-sending the current (possibly closed) parent is not a change; only a new parent must be open.
        await assertDepartmentRefs(tx, ctx, input.parentId === before.parentId ? { ...input, parentId: undefined } : input, id);
        const d = await guardUnique(() => repo.updateDepartment(tx, ctx.workspaceId, id, input));
        await audit(tx, ctx, 'department.updated', 'Department', id, { changes: changedFields(before, input) } as Prisma.InputJsonValue);
        return toDepartment(d);
      }),
    setDepartmentActive: (ctx: AuthContext, id: string, isActive: boolean) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const before = found(await repo.findDepartment(tx, ctx.workspaceId, id));
        // Closing a parent would leave open sub-departments under a closed one.
        if (!isActive && (await repo.openChildDepartments(tx, ctx.workspaceId, id)) > 0) throw conflict('has_open_children');
        const d = await repo.updateDepartment(tx, ctx.workspaceId, id, { isActive });
        if (before.isActive !== isActive) {
          await audit(tx, ctx, isActive ? 'department.reopened' : 'department.closed', 'Department', id, { name: d.name });
        }
        return toDepartment(d);
      }),
    deleteDepartment: (ctx: AuthContext, id: string) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await safeDelete(await repo.departmentInUse(tx, ctx.workspaceId, id), () => repo.deleteDepartment(tx, ctx.workspaceId, id));
        await audit(tx, ctx, 'department.deleted', 'Department', id);
      }),

    listPositions: (ctx: AuthContext, query: OrgListQuery = {}) =>
      db.tenant(ctx.workspaceId, async (tx) => (await repo.listPositions(tx, ctx.workspaceId, query.includeClosed)).map(toPosition)),
    createPosition: (ctx: AuthContext, input: CreatePositionInput) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const p = await guardUnique(() => repo.createPosition(tx, { name: input.name, level: input.level ?? 0, workspaceId: ctx.workspaceId }));
        await audit(tx, ctx, 'position.created', 'Position', p.id, { name: p.name, level: p.level });
        return toPosition(p);
      }),
    updatePosition: (ctx: AuthContext, id: string, input: Partial<CreatePositionInput>) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const before = found(await repo.findPosition(tx, ctx.workspaceId, id));
        const p = await guardUnique(() => repo.updatePosition(tx, ctx.workspaceId, id, input));
        await audit(tx, ctx, 'position.updated', 'Position', id, { changes: changedFields(before, input) } as Prisma.InputJsonValue);
        return toPosition(p);
      }),
    setPositionActive: (ctx: AuthContext, id: string, isActive: boolean) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const before = found(await repo.findPosition(tx, ctx.workspaceId, id));
        const p = await repo.updatePosition(tx, ctx.workspaceId, id, { isActive });
        if (before.isActive !== isActive) await audit(tx, ctx, isActive ? 'position.reopened' : 'position.closed', 'Position', id, { name: p.name });
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

    orgStructure: (ctx: AuthContext): Promise<OrgStructureNode[]> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const { departments, employees } = await repo.orgStructureRows(tx, ctx.workspaceId);
        return buildOrgStructure({
          departments,
          employees: employees.map((e) => ({
            id: e.id,
            employeeCode: e.employeeCode,
            name: `${e.firstName} ${e.lastName}`,
            position: e.position?.name ?? null,
            departmentId: e.departmentId,
          })),
        });
      }),
  };
};
export type OrgService = ReturnType<typeof createOrgService>;
