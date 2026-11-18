import {
  LEAVE_TYPE_IMMUTABLE_FIELDS,
  LEAVE_TYPE_LOCKED_FIELDS,
  LeaveCategory,
  validateLeavePolicy,
  type CreateLeaveTypeInput,
  type LeaveType,
  type LeaveTypeUpdateRequest,
} from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import { isUniqueViolation } from '../../db/client';
import { badRequest, conflict } from '../../lib/errors';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { changedFields } from '../org/org.service';
import { leaveTypesRepository, toLeaveTypeView, type LeaveTypeRow } from './leave-types.repository';

type PolicyInput = CreateLeaveTypeInput['policy'];

/** Policy numbers after the edit: an omitted optional number keeps the stored one, `null` clears it. */
const mergedPolicy = (input: PolicyInput, current: LeaveType['policy'] | null) => ({
  daysPerYear: input.daysPerYear,
  hazardousDays: input.hazardousDays === undefined ? (current?.hazardousDays ?? null) : input.hazardousDays,
  multipleBirthDays: input.multipleBirthDays === undefined ? (current?.multipleBirthDays ?? null) : input.multipleBirthDays,
  minServiceDays: input.minServiceDays,
  minServicePayTypes: [...input.minServicePayTypes],
});

/** 400 `below_legal_minimum` + `{ field, legalMin }` when the policy grants less than the law (FR-LV-01.2). */
const assertLegalMinimum = (category: LeaveCategory, policy: ReturnType<typeof mergedPolicy>) => {
  const violation = validateLeavePolicy(category, policy);
  if (violation) throw badRequest('below_legal_minimum', violation);
};

/** Fields the request tries to change although they are fixed for this type (statutory or not). */
const lockedChanges = (row: LeaveTypeRow, input: LeaveTypeUpdateRequest): string[] => {
  const fields: readonly (typeof LEAVE_TYPE_LOCKED_FIELDS)[number][] = row.isCustom ? LEAVE_TYPE_IMMUTABLE_FIELDS : LEAVE_TYPE_LOCKED_FIELDS;
  return fields.filter((f) => input[f] !== undefined && (input[f] ?? null) !== (row[f] ?? null));
};

/**
 * Leave type settings (FR-LV-01, FR-LV-02): HR (`leave.manage`, guarded in the routes) edits the statutory types'
 * policy within the legal minimum and adds custom types (category OTHER). Every change is audit-logged.
 */
export const createLeavePolicyService = (db: Db) => {
  const audit = (tx: Tx, ctx: AuthContext, action: string, entityId: string, meta: Prisma.InputJsonValue) =>
    auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action, entity: 'LeaveType', entityId, meta });

  return {
    create: (ctx: AuthContext, input: CreateLeaveTypeInput): Promise<LeaveType> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const policy = mergedPolicy(input.policy, null);
        assertLegalMinimum(LeaveCategory.OTHER, policy);
        const last = await tx.leaveType.aggregate({ where: { workspaceId: ctx.workspaceId }, _max: { sortOrder: true } });
        let id: string;
        try {
          ({ id } = await tx.leaveType.create({
            data: {
              workspaceId: ctx.workspaceId,
              code: input.code,
              category: LeaveCategory.OTHER,
              nameLo: input.nameLo,
              nameEn: input.nameEn,
              paid: input.paid,
              requiresAttachment: input.requiresAttachment,
              allowHalfDay: input.allowHalfDay,
              gender: input.gender,
              isActive: input.isActive,
              countingMethod: input.countingMethod,
              quotaPeriod: input.quotaPeriod,
              isCustom: true,
              sortOrder: (last._max.sortOrder ?? 0) + 1,
              policy: { create: { workspaceId: ctx.workspaceId, ...policy } },
            },
            select: { id: true },
          }));
        } catch (err) {
          if (isUniqueViolation(err)) throw conflict('leave_type_code_taken');
          throw err;
        }
        const view = toLeaveTypeView(await leaveTypesRepository.get(tx, ctx.workspaceId, id));
        await audit(tx, ctx, 'leave_type.created', id, { code: view.code, nameEn: view.nameEn, quotaPeriod: view.quotaPeriod, policy });
        return view;
      }),

    update: (ctx: AuthContext, id: string, input: LeaveTypeUpdateRequest): Promise<LeaveType> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const row = await leaveTypesRepository.get(tx, ctx.workspaceId, id);
        const locked = lockedChanges(row, input);
        if (locked.length) throw badRequest('leave_type_field_locked', { fields: locked });
        const before = toLeaveTypeView(row);
        const policy = mergedPolicy(input.policy, before.policy);
        assertLegalMinimum(before.category, policy);

        const typeFields = {
          nameLo: input.nameLo,
          nameEn: input.nameEn,
          paid: input.paid,
          requiresAttachment: input.requiresAttachment,
          allowHalfDay: input.allowHalfDay,
          isActive: input.isActive,
          ...(row.isCustom
            ? {
                ...(input.countingMethod ? { countingMethod: input.countingMethod } : {}),
                ...(input.quotaPeriod ? { quotaPeriod: input.quotaPeriod } : {}),
                ...(input.gender !== undefined ? { gender: input.gender } : {}),
              }
            : {}),
        };
        await tx.leaveType.update({ where: { id: row.id }, data: typeFields });
        await tx.leavePolicy.upsert({
          where: { leaveTypeId: row.id },
          create: { workspaceId: ctx.workspaceId, leaveTypeId: row.id, ...policy },
          update: policy,
        });
        const after = toLeaveTypeView(await leaveTypesRepository.get(tx, ctx.workspaceId, id));
        const changes = {
          ...changedFields(before as unknown as Record<string, unknown>, typeFields),
          ...Object.fromEntries(
            Object.entries(changedFields(before.policy as unknown as Record<string, unknown>, policy))
              .filter(([k]) => k !== 'minServicePayTypes')
              .map(([k, v]) => [`policy.${k}`, v]),
          ),
          ...(before.policy.minServicePayTypes.join(',') !== after.policy.minServicePayTypes.join(',')
            ? { 'policy.minServicePayTypes': { from: before.policy.minServicePayTypes, to: after.policy.minServicePayTypes } }
            : {}),
        };
        await audit(tx, ctx, 'leave_type.updated', id, { code: after.code, changes } as Prisma.InputJsonValue);
        return after;
      }),
  };
};

export type LeavePolicyService = ReturnType<typeof createLeavePolicyService>;
