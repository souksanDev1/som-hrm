import {
  LEAVE_LEGAL_MINIMUM,
  type Gender,
  type LeaveCategory,
  type LeavePolicyRule,
  type LeaveType,
  type LeaveTypeRule,
  type PayType,
} from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';
import { notFound } from '../../lib/errors';

export const leaveTypeInclude = { policy: true } satisfies Prisma.LeaveTypeInclude;
export type LeaveTypeRow = Prisma.LeaveTypeGetPayload<{ include: typeof leaveTypeInclude }>;

const num = (d: Prisma.Decimal | null | undefined): number | null => (d === null || d === undefined ? null : Number(d));

/** Policy numbers of a type; a type without a policy row has a zero quota. */
export const toPolicyRule = (row: LeaveTypeRow): LeavePolicyRule => ({
  daysPerYear: num(row.policy?.daysPerYear) ?? 0,
  hazardousDays: num(row.policy?.hazardousDays),
  multipleBirthDays: num(row.policy?.multipleBirthDays),
  minServiceDays: row.policy?.minServiceDays ?? 0,
  minServicePayTypes: (row.policy?.minServicePayTypes ?? []) as PayType[],
});

export const toTypeRule = (row: LeaveTypeRow): LeaveTypeRule => ({
  category: row.category as LeaveCategory,
  quotaPeriod: row.quotaPeriod,
  countingMethod: row.countingMethod,
  gender: row.gender as Gender | null,
  allowHalfDay: row.allowHalfDay,
  requiresAttachment: row.requiresAttachment,
});

/** API view of a leave type with its policy and statutory minimum (FR-LV-01). */
export const toLeaveTypeView = (row: LeaveTypeRow): LeaveType => ({
  id: row.id,
  code: row.code,
  category: row.category as LeaveCategory,
  nameLo: row.nameLo,
  nameEn: row.nameEn,
  paid: row.paid,
  requiresAttachment: row.requiresAttachment,
  allowHalfDay: row.allowHalfDay,
  gender: row.gender as Gender | null,
  isActive: row.isActive,
  countingMethod: row.countingMethod,
  quotaPeriod: row.quotaPeriod,
  isCustom: row.isCustom,
  sortOrder: row.sortOrder,
  policy: { ...toPolicyRule(row), minServicePayTypes: [...toPolicyRule(row).minServicePayTypes] },
  legalMin: LEAVE_LEGAL_MINIMUM[row.category as LeaveCategory] ?? null,
});

export const leaveTypesRepository = {
  list: (tx: Tx, workspaceId: string, opts: { activeOnly?: boolean } = {}) =>
    tx.leaveType.findMany({
      where: { workspaceId, ...(opts.activeOnly ? { isActive: true } : {}) },
      include: leaveTypeInclude,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),

  find: (tx: Tx, workspaceId: string, id: string) => tx.leaveType.findFirst({ where: { workspaceId, id }, include: leaveTypeInclude }),

  /** The type or 404 `leave_type_not_found`. */
  get: async (tx: Tx, workspaceId: string, id: string): Promise<LeaveTypeRow> => {
    const row = await leaveTypesRepository.find(tx, workspaceId, id);
    if (!row) throw notFound('leave_type_not_found');
    return row;
  },
};
