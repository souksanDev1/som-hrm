import { leaveYearOf, PERMISSIONS, type LeaveAdjustInput, type LeaveLedgerEntry, type LeaveLedgerKind, type LeaveLedgerQuery } from '@hrm/shared';
import type { Db, Tx } from '../../db/client';
import { todayInTimeZone, toIsoDate } from '../../lib/dates';
import { notFound } from '../../lib/errors';
import { workspaceTimeZone } from '../attendance/day-context';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { employeeAccess } from '../employees/employees.service';
import { leaveLedger } from './leave-ledger';
import { leaveTypesRepository } from './leave-types.repository';

interface LedgerRow {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  periodYear: number;
  kind: LeaveLedgerKind;
  days: unknown;
  effectiveDate: Date;
  leaveRequestId: string | null;
  reason: string | null;
  createdById: string | null;
  createdAt: Date;
}

/** API view of ledger rows with the name of the user who posted each one (null = system job, FR-LV-07.3). */
const toEntryViews = async (tx: Tx, rows: LedgerRow[]): Promise<LeaveLedgerEntry[]> => {
  const userIds = [...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v))];
  const users = userIds.length ? await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    leaveTypeId: r.leaveTypeId,
    periodYear: r.periodYear,
    kind: r.kind,
    days: Number(r.days),
    effectiveDate: toIsoDate(r.effectiveDate)!,
    leaveRequestId: r.leaveRequestId,
    reason: r.reason,
    createdByName: r.createdById ? (names.get(r.createdById) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
  }));
};

/** HR leave roles see every employee of the workspace; others only their data scope. 404 outside it. */
const assertLedgerAccess = async (tx: Tx, auth: AuthContext, employeeId: string) => {
  if (employeeId === auth.employeeId) return;
  if (auth.permissions.includes(PERMISSIONS.LEAVE_MANAGE) || auth.permissions.includes(PERMISSIONS.LEAVE_LEDGER_ADJUST)) {
    const exists = await tx.employee.findFirst({ where: { workspaceId: auth.workspaceId, id: employeeId }, select: { id: true } });
    if (!exists) throw notFound('employee_not_found');
    return;
  }
  await employeeAccess.assertCanRead(tx, auth, employeeId);
};

/** Leave balance ledger: per-employee audit view (FR-LV-07.3) and HR adjustments with a reason (FR-LV-07.2). */
export const createLeaveLedgerService = (db: Db) => ({
  list: (auth: AuthContext, query: LeaveLedgerQuery): Promise<LeaveLedgerEntry[]> =>
    db.tenant(auth.workspaceId, async (tx) => {
      const employeeId = query.employeeId ?? auth.employeeId;
      if (!employeeId) throw notFound('no_employee_profile');
      await assertLedgerAccess(tx, auth, employeeId);
      const rows = await leaveLedger.entries(tx, auth.workspaceId, employeeId, { leaveTypeId: query.leaveTypeId, year: query.year });
      return toEntryViews(tx, rows);
    }),

  /** Post an ADJUST movement (signed days) dated today in the workspace time zone; audit-logged. */
  adjust: (auth: AuthContext, input: LeaveAdjustInput): Promise<LeaveLedgerEntry> =>
    db.tenant(auth.workspaceId, async (tx) => {
      const employee = await tx.employee.findFirst({ where: { workspaceId: auth.workspaceId, id: input.employeeId }, select: { id: true } });
      if (!employee) throw notFound('employee_not_found');
      await leaveTypesRepository.get(tx, auth.workspaceId, input.leaveTypeId);
      const today = todayInTimeZone(await workspaceTimeZone(tx, auth.workspaceId));
      // Effective today when adjusting the current year, else on 1 January / 31 December of the adjusted year.
      const year = leaveYearOf(today);
      const effectiveDate = input.periodYear === year ? today : input.periodYear < year ? `${input.periodYear}-12-31` : `${input.periodYear}-01-01`;
      const row = await leaveLedger.post(tx, auth.workspaceId, {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        periodYear: input.periodYear,
        kind: 'ADJUST',
        days: input.days,
        effectiveDate,
        reason: input.reason,
        createdById: auth.userId,
      });
      await auditRepository.create(tx, {
        workspaceId: auth.workspaceId,
        actorUserId: auth.userId,
        action: 'leave_ledger.adjusted',
        entity: 'LeaveLedgerEntry',
        entityId: row.id,
        meta: { employeeId: input.employeeId, leaveTypeId: input.leaveTypeId, periodYear: input.periodYear, days: input.days, reason: input.reason },
      });
      const [view] = await toEntryViews(tx, [row]);
      return view!;
    }),
});

export type LeaveLedgerService = ReturnType<typeof createLeaveLedgerService>;
