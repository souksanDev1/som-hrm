import { entitlementGrantDate, leaveYearOf, quotaDays } from '@hrm/shared';
import type { Db } from '../../db/client';
import { DEFAULT_TIME_ZONE, parseIsoDate, todayInTimeZone, toIsoDate } from '../../lib/dates';
import { ACTIVE_STATUSES } from '../../modules/employees/employees.repository';
import { leaveTypeInclude, toPolicyRule, toTypeRule } from '../../modules/leave/leave-types.repository';

export interface LeaveAccrualRunResult {
  /** Entitlement rows newly posted (re-runs post 0). */
  granted: number;
}

/**
 * Yearly leave entitlement for one workspace (FR-LV-07.1), run daily. For every employed employee and every active
 * YEARLY type, the current leave year's quota (`quotaDays`: hazardous-work days when they apply) is posted as an
 * ENTITLEMENT once its grant date (`entitlementGrantDate`: 1 January, or the day the minimum service is reached —
 * annual leave after one year, sick leave after 90 days for daily/hourly pay only) is today or past, in the
 * workspace time zone. Calendar year, full quota, no pro-rata (client Q10). Idempotent through the partial unique
 * index (one ENTITLEMENT per employee / type / year) and `skipDuplicates`.
 */
export const runLeaveAccrual = (db: Db, workspaceId: string, now: Date = new Date()): Promise<LeaveAccrualRunResult> =>
  db.tenant(
    workspaceId,
    async (tx) => {
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
      if (!workspace) return { granted: 0 };
      const today = todayInTimeZone(workspace.timezone || DEFAULT_TIME_ZONE, now);
      const year = leaveYearOf(today);

      const [types, employees] = await Promise.all([
        tx.leaveType.findMany({ where: { workspaceId, isActive: true, quotaPeriod: 'YEARLY' }, include: leaveTypeInclude }),
        tx.employee.findMany({
          where: { workspaceId, status: { in: [...ACTIVE_STATUSES] } },
          select: { id: true, hireDate: true, payType: true, hazardousWork: true },
        }),
      ]);
      const data = [];
      for (const type of types) {
        const typeRule = toTypeRule(type);
        const policy = toPolicyRule(type);
        for (const e of employees) {
          const employee = { hireDate: toIsoDate(e.hireDate)!, payType: e.payType, hazardousWork: e.hazardousWork };
          const grant = entitlementGrantDate(year, typeRule, employee, policy);
          if (!grant || grant > today) continue;
          const days = quotaDays(typeRule, policy, employee);
          if (!days) continue;
          data.push({
            workspaceId,
            employeeId: e.id,
            leaveTypeId: type.id,
            periodYear: year,
            kind: 'ENTITLEMENT' as const,
            days,
            effectiveDate: parseIsoDate(grant),
          });
        }
      }
      if (!data.length) return { granted: 0 };
      const { count } = await tx.leaveLedgerEntry.createMany({ data, skipDuplicates: true });
      return { granted: count };
    },
    { timeoutMs: 120_000 },
  );
