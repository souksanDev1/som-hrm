import { addDays, carryOverDays, carryOverExpiryDate, expiringCarryDays, leaveYearOf, roundLeaveDays } from '@hrm/shared';
import type { Db } from '../../db/client';
import { DEFAULT_TIME_ZONE, parseIsoDate, todayInTimeZone } from '../../lib/dates';
import { ACTIVE_STATUSES } from '../../modules/employees/employees.repository';
import { leaveLedger } from '../../modules/leave/leave-ledger';
import { parameterReader } from '../../modules/parameters/parameters.service';

export interface LeaveCarryOverRunResult {
  /** CARRY rows newly posted. */
  carried: number;
  /** EXPIRE rows newly posted. */
  expired: number;
}

/**
 * Annual-leave carry-over and its expiry for one workspace (SHOULD FR-LV-08), run daily; idempotent through the
 * partial unique index (one CARRY / EXPIRE per employee / type / year).
 *
 * - CARRY (from 1 January of year Y): for every employed employee and active ANNUAL-category YEARLY type, the
 *   unused balance of Y-1 capped by `leave.carryOverMaxDays` (`carryOverDays`; 0 = off, the default, → nothing).
 * - EXPIRE (after the last day of month `leave.carryOverExpiryMonth` of Y): carried days still unused by then
 *   (`expiringCarryDays`, usage consumes carried days first). Parameters are read as effective on 1 January of Y.
 */
export const runLeaveCarryOver = (db: Db, workspaceId: string, now: Date = new Date()): Promise<LeaveCarryOverRunResult> =>
  db.tenant(
    workspaceId,
    async (tx) => {
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
      if (!workspace) return { carried: 0, expired: 0 };
      const today = todayInTimeZone(workspace.timezone || DEFAULT_TIME_ZONE, now);
      const year = leaveYearOf(today);
      const yearStart = `${year}-01-01`;
      const params = await parameterReader.workspaceMany(tx, workspaceId, ['leave.carryOverMaxDays', 'leave.carryOverExpiryMonth'], parseIsoDate(yearStart));

      let carried = 0;
      const maxDays = params['leave.carryOverMaxDays'];
      if (maxDays > 0) {
        const [types, employees] = await Promise.all([
          tx.leaveType.findMany({ where: { workspaceId, isActive: true, category: 'ANNUAL', quotaPeriod: 'YEARLY' }, select: { id: true } }),
          tx.employee.findMany({ where: { workspaceId, status: { in: [...ACTIVE_STATUSES] } }, select: { id: true } }),
        ]);
        const data = [];
        for (const type of types) {
          for (const e of employees) {
            const previous = (await leaveLedger.balanceByYear(tx, workspaceId, e.id, type.id, [year - 1]))[year - 1] ?? 0;
            const days = carryOverDays(previous, maxDays);
            if (days > 0) {
              data.push({ workspaceId, employeeId: e.id, leaveTypeId: type.id, periodYear: year, kind: 'CARRY' as const, days, effectiveDate: parseIsoDate(yearStart) });
            }
          }
        }
        if (data.length) carried = (await tx.leaveLedgerEntry.createMany({ data, skipDuplicates: true })).count;
      }

      let expired = 0;
      const expiry = carryOverExpiryDate(year, params['leave.carryOverExpiryMonth']);
      if (today > expiry) {
        const carries = await tx.leaveLedgerEntry.findMany({ where: { workspaceId, periodYear: year, kind: 'CARRY' } });
        const done = await tx.leaveLedgerEntry.findMany({
          where: { workspaceId, periodYear: year, kind: 'EXPIRE' },
          select: { employeeId: true, leaveTypeId: true },
        });
        const doneKeys = new Set(done.map((d) => `${d.employeeId}:${d.leaveTypeId}`));
        const data = [];
        for (const c of carries) {
          if (doneKeys.has(`${c.employeeId}:${c.leaveTypeId}`)) continue;
          const usage = await tx.leaveLedgerEntry.aggregate({
            where: { workspaceId, employeeId: c.employeeId, leaveTypeId: c.leaveTypeId, periodYear: year, kind: { in: ['USAGE', 'CANCEL'] }, effectiveDate: { lte: parseIsoDate(expiry) } },
            _sum: { days: true },
          });
          const used = roundLeaveDays(-Number(usage._sum.days ?? 0));
          const days = expiringCarryDays(Number(c.days), used);
          if (days > 0) {
            data.push({
              workspaceId,
              employeeId: c.employeeId,
              leaveTypeId: c.leaveTypeId,
              periodYear: year,
              kind: 'EXPIRE' as const,
              days: -days,
              effectiveDate: parseIsoDate(addDays(expiry, 1)),
            });
          }
        }
        if (data.length) expired = (await tx.leaveLedgerEntry.createMany({ data, skipDuplicates: true })).count;
      }
      return { carried, expired };
    },
    { timeoutMs: 120_000 },
  );
