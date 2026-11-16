import {
  hoursToMinutes,
  isoDateInTimeZone,
  minutesToHours,
  resolveStandardVersion,
  resolveWorkPattern,
  validateWorkPattern,
  weeklyHoursOf,
  type ApplyScheduleOverrideInput,
  type EmployeeWorkSchedule,
  type ResolvedWorkPattern,
  type RevertScheduleOverrideInput,
  type ScheduleAssignment,
  type ScheduleAssignmentInput,
  type ScheduleBulkResult,
  type ScheduleOverrideList,
  type SetStandardScheduleInput,
  type StandardScheduleVersion,
  type StandardScheduleVersionInput,
  type StandardScheduleView,
  type WorkPatternLimits,
} from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { employeeAccess } from '../employees/employees.service';
import { parametersRepository } from '../parameters/parameters.repository';
import { parameterReader } from '../parameters/parameters.service';
import { schedulesRepository as repo, type AssignmentRow, type StandardVersionRow } from './schedules.repository';

interface RequestMeta {
  ip?: string;
}

const iso = (d: Date) => toIsoDate(d)!;

const toStandardInput = (v: StandardVersionRow): StandardScheduleVersionInput => ({
  id: v.id,
  effectiveFrom: iso(v.effectiveFrom!),
  dayHours: minutesToHours(v.dayMinutes),
});

const toAssignmentInput = (a: AssignmentRow): ScheduleAssignmentInput => ({
  effectiveFrom: iso(a.effectiveFrom),
  schedule: a.schedule ? { id: a.schedule.id, dayHours: minutesToHours(a.schedule.dayMinutes), label: a.schedule.name || null } : null,
});

const groupByEmployee = (rows: AssignmentRow[]) => {
  const map = new Map<string, AssignmentRow[]>();
  for (const r of rows) map.set(r.employeeId, [...(map.get(r.employeeId) ?? []), r]);
  return map;
};

/** Pure resolution over pre-loaded rows; throws when the workspace has no standard at all. */
const resolveFrom = (standards: StandardScheduleVersionInput[], assignments: AssignmentRow[], date: string): ResolvedWorkPattern => {
  const resolved = resolveWorkPattern(date, standards, assignments.map(toAssignmentInput));
  if (!resolved) throw conflict('schedule_not_configured');
  return resolved;
};

/**
 * Pattern in force for each employee on `date` (YYYY-MM-DD, workspace time zone): their override, or
 * the workspace standard version of that date (FR-WS-03.2/03.6). Run inside the caller's tenant
 * transaction. Attendance (M5) and leave (M6) use this to know working days and scheduled hours.
 */
export const resolveEmployeeWorkPatterns = async (
  tx: Tx,
  workspaceId: string,
  employeeIds: string[],
  date: string,
): Promise<Map<string, ResolvedWorkPattern>> => {
  const standards = (await repo.listStandardVersions(tx, workspaceId)).map(toStandardInput);
  const byEmployee = groupByEmployee(await repo.listAssignments(tx, workspaceId, employeeIds));
  return new Map(employeeIds.map((id) => [id, resolveFrom(standards, byEmployee.get(id) ?? [], date)]));
};

/** Single-employee form of {@link resolveEmployeeWorkPatterns}: `resolveWorkPattern(employeeId, date)`. */
export const resolveEmployeeWorkPattern = async (tx: Tx, workspaceId: string, employeeId: string, date: string): Promise<ResolvedWorkPattern> =>
  (await resolveEmployeeWorkPatterns(tx, workspaceId, [employeeId], date)).get(employeeId)!;

const todayIn = async (tx: Tx, workspaceId: string) => isoDateInTimeZone(await parametersRepository.workspaceTimezone(tx, workspaceId));

/** Pattern limits from the parameter store, as in force on `date` (FR-WS-03.1, FR-WS-08). */
const limitsOn = async (tx: Tx, workspaceId: string, date: Date): Promise<WorkPatternLimits> => ({
  maxHoursPerDay: await parameterReader.workspace(tx, workspaceId, 'schedule.standardHoursPerDay', date),
  maxHoursPerWeek: await parameterReader.workspace(tx, workspaceId, 'schedule.maxHoursPerWeek', date),
});

/** Changes only take effect from today onwards, so the past is never rewritten (FR-WS-03.7). */
const assertNotPast = (effectiveFrom: string, today: string) => {
  if (effectiveFrom < today) throw badRequest('effective_date_in_past', { field: 'effectiveFrom', today });
};

const assertPattern = async (tx: Tx, workspaceId: string, dayHours: number[], at: Date) => {
  const limits = await limitsOn(tx, workspaceId, at);
  const error = validateWorkPattern(dayHours, limits);
  if (error) throw badRequest(error, { field: 'dayHours', ...limits });
};

const createdByIds = (rows: { createdById: string | null }[]) => [...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v))];

const toVersionView = (v: StandardVersionRow, names: Map<string, string>): StandardScheduleVersion => {
  const dayHours = minutesToHours(v.dayMinutes);
  return {
    id: v.id,
    effectiveFrom: iso(v.effectiveFrom!),
    dayHours,
    weeklyHours: weeklyHoursOf(dayHours),
    reason: v.reason,
    createdByName: v.createdById ? (names.get(v.createdById) ?? null) : null,
    createdAt: v.createdAt.toISOString(),
  };
};

const toAssignmentView = (a: AssignmentRow, names: Map<string, string>): ScheduleAssignment => ({
  id: a.id,
  effectiveFrom: iso(a.effectiveFrom),
  source: a.schedule ? 'override' : 'standard',
  dayHours: a.schedule ? minutesToHours(a.schedule.dayMinutes) : null,
  label: a.schedule?.name || null,
  reason: a.reason,
  createdByName: a.createdById ? (names.get(a.createdById) ?? null) : null,
  createdAt: a.createdAt.toISOString(),
});

const standardView = async (tx: Tx, workspaceId: string, today: string): Promise<StandardScheduleView> => {
  const versions = await repo.listStandardVersions(tx, workspaceId);
  const current = resolveStandardVersion(versions.map(toStandardInput), today);
  if (!current) throw conflict('schedule_not_configured');
  const names = await parametersRepository.userNames(tx, createdByIds(versions));
  const view = (v: StandardVersionRow) => toVersionView(v, names);
  const inEffect = (v: StandardVersionRow) => iso(v.effectiveFrom!) <= today || v.id === current.id;
  return {
    asOf: today,
    current: view(versions.find((v) => v.id === current.id)!),
    scheduled: versions.filter((v) => !inEffect(v)).map(view),
    history: versions.filter(inEffect).reverse().map(view),
    limits: await limitsOn(tx, workspaceId, parseIsoDate(today)),
  };
};

const employeeView = async (tx: Tx, workspaceId: string, employeeId: string): Promise<EmployeeWorkSchedule> => {
  const today = await todayIn(tx, workspaceId);
  const standards = (await repo.listStandardVersions(tx, workspaceId)).map(toStandardInput);
  const assignments = await repo.listAssignments(tx, workspaceId, [employeeId]);
  const names = await parametersRepository.userNames(tx, createdByIds(assignments));
  return {
    employeeId,
    asOf: today,
    current: resolveFrom(standards, assignments, today),
    upcoming: assignments.filter((a) => iso(a.effectiveFrom) > today).map((a) => toAssignmentView(a, names)),
    history: assignments.filter((a) => iso(a.effectiveFrom) <= today).reverse().map((a) => toAssignmentView(a, names)),
  };
};

/**
 * Working schedules (FR-WS-03): the effective-dated workspace standard, per-employee overrides
 * (bulk apply / revert) and read views. Every change is effective-dated and audit-logged.
 */
export const createSchedulesService = (db: Db) => {
  /** Validated, de-duplicated employee ids of a bulk request (all must exist in the workspace). */
  const loadEmployees = async (tx: Tx, workspaceId: string, employeeIds: string[]) => {
    const ids = [...new Set(employeeIds)];
    const employees = await repo.employeesByIds(tx, workspaceId, ids);
    if (employees.length !== ids.length) throw badRequest('invalid_reference', { fields: ['employeeIds'] });
    return ids;
  };

  /** Write one assignment per employee and audit each with the pattern it replaces (old/new/who/when). */
  const assign = async (
    tx: Tx,
    ctx: AuthContext,
    ids: string[],
    before: Map<string, ResolvedWorkPattern>,
    change: { scheduleId: string | null; dayHours: number[] | null; label: string | null; effectiveFrom: string; reason: string },
    meta: RequestMeta,
  ) => {
    for (const employeeId of ids) {
      const row = await repo.upsertAssignment(tx, {
        workspaceId: ctx.workspaceId,
        employeeId,
        scheduleId: change.scheduleId,
        effectiveFrom: parseIsoDate(change.effectiveFrom),
        reason: change.reason,
        createdById: ctx.userId,
      });
      const old = before.get(employeeId)!;
      await auditRepository.create(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: change.scheduleId ? 'schedule.override.apply' : 'schedule.override.revert',
        entity: 'Employee',
        entityId: employeeId,
        meta: {
          assignmentId: row.id,
          effectiveFrom: change.effectiveFrom,
          reason: change.reason,
          old: { source: old.source, dayHours: old.dayHours, label: old.label },
          new: change.scheduleId
            ? { source: 'override', scheduleId: change.scheduleId, dayHours: change.dayHours, label: change.label }
            : { source: 'standard' },
        } as Prisma.InputJsonValue,
        ip: meta.ip,
      });
    }
  };

  return {
    getStandard: (ctx: AuthContext): Promise<StandardScheduleView> =>
      db.tenant(ctx.workspaceId, async (tx) => standardView(tx, ctx.workspaceId, await todayIn(tx, ctx.workspaceId))),

    /**
     * Schedule a new standard from `effectiveFrom` (FR-WS-03.1). A version already scheduled for the
     * same date is replaced (the replaced pattern stays in the audit log). Overrides are untouched (03.6).
     */
    setStandard: (ctx: AuthContext, input: SetStandardScheduleInput, meta: RequestMeta): Promise<StandardScheduleView> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        const today = await todayIn(tx, ws);
        assertNotPast(input.effectiveFrom, today);
        await assertPattern(tx, ws, input.dayHours, parseIsoDate(input.effectiveFrom));

        const versions = await repo.listStandardVersions(tx, ws);
        const beforeId = resolveStandardVersion(versions.map(toStandardInput), input.effectiveFrom)?.id;
        const before = versions.find((v) => v.id === beforeId);
        if (!before) throw conflict('schedule_not_configured');
        const existing = versions.find((v) => iso(v.effectiveFrom!) === input.effectiveFrom);
        const data = { dayMinutes: hoursToMinutes(input.dayHours), reason: input.reason, createdById: ctx.userId };
        const row = existing
          ? await repo.updateStandardVersion(tx, existing.id, data)
          : await repo.createSchedule(tx, {
              ...data,
              workspaceId: ws,
              name: before.name,
              shiftId: before.shiftId,
              isDefault: true,
              effectiveFrom: parseIsoDate(input.effectiveFrom),
            });

        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: ctx.userId,
          action: existing ? 'schedule.standard.reschedule' : 'schedule.standard.change',
          entity: 'WorkSchedule',
          entityId: row.id,
          meta: {
            effectiveFrom: input.effectiveFrom,
            reason: input.reason,
            oldDayHours: minutesToHours(before.dayMinutes),
            newDayHours: input.dayHours,
          } as Prisma.InputJsonValue,
          ip: meta.ip,
        });
        return standardView(tx, ws, today);
      }),

    /** Employees who work an override today or have an assignment scheduled (FR-WS-03.2/03.4). */
    listOverrides: (ctx: AuthContext): Promise<ScheduleOverrideList> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        const today = await todayIn(tx, ws);
        const standards = (await repo.listStandardVersions(tx, ws)).map(toStandardInput);
        const assignments = await repo.listAssignments(tx, ws);
        const names = await parametersRepository.userNames(tx, createdByIds(assignments));
        const byEmployee = groupByEmployee(assignments);
        const employees = await repo.employeesByIds(tx, ws, [...byEmployee.keys()]);
        const items = employees.flatMap((e) => {
          const rows = byEmployee.get(e.id)!;
          const current = resolveFrom(standards, rows, today);
          const next = rows.find((a) => iso(a.effectiveFrom) > today);
          if (current.source !== 'override' && !next) return [];
          return [
            {
              employee: { id: e.id, employeeCode: e.employeeCode, name: `${e.firstName} ${e.lastName}` },
              current,
              next: next ? toAssignmentView(next, names) : null,
            },
          ];
        });
        return { asOf: today, items };
      }),

    /** Give the selected employees one individual pattern from `effectiveFrom` (FR-WS-03.2/03.3). */
    applyOverride: (ctx: AuthContext, input: ApplyScheduleOverrideInput, meta: RequestMeta): Promise<ScheduleBulkResult> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        assertNotPast(input.effectiveFrom, await todayIn(tx, ws));
        await assertPattern(tx, ws, input.dayHours, parseIsoDate(input.effectiveFrom));
        const ids = await loadEmployees(tx, ws, input.employeeIds);

        const versions = await repo.listStandardVersions(tx, ws);
        const baseId = resolveStandardVersion(versions.map(toStandardInput), input.effectiveFrom)?.id;
        const base = versions.find((v) => v.id === baseId);
        if (!base) throw conflict('schedule_not_configured');
        const before = await resolveEmployeeWorkPatterns(tx, ws, ids, input.effectiveFrom);

        const label = input.label || null;
        const schedule = await repo.createSchedule(tx, {
          workspaceId: ws,
          name: label ?? '',
          dayMinutes: hoursToMinutes(input.dayHours),
          // Shift times are not part of FR-WS-03; overrides keep the standard's shift.
          shiftId: base.shiftId,
          isDefault: false,
          reason: input.reason,
          createdById: ctx.userId,
        });
        const change = { scheduleId: schedule.id, dayHours: input.dayHours, label, effectiveFrom: input.effectiveFrom, reason: input.reason };
        await assign(tx, ctx, ids, before, change, meta);
        return { count: ids.length };
      }),

    /** Put employees who have an override on that date back on the standard (FR-WS-03.4). */
    revertOverride: (ctx: AuthContext, input: RevertScheduleOverrideInput, meta: RequestMeta): Promise<ScheduleBulkResult> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        assertNotPast(input.effectiveFrom, await todayIn(tx, ws));
        const ids = await loadEmployees(tx, ws, input.employeeIds);
        const before = await resolveEmployeeWorkPatterns(tx, ws, ids, input.effectiveFrom);
        const onStandard = ids.filter((id) => before.get(id)!.source !== 'override');
        if (onStandard.length) throw conflict('schedule_not_overridden', { employeeIds: onStandard });

        const change = { scheduleId: null, dayHours: null, label: null, effectiveFrom: input.effectiveFrom, reason: input.reason };
        await assign(tx, ctx, ids, before, change, meta);
        return { count: ids.length };
      }),

    /** Schedule of one employee for the profile card (FR-WS-03.5); same data scope as the profile. */
    getForEmployee: (ctx: AuthContext, employeeId: string): Promise<EmployeeWorkSchedule> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await employeeAccess.assertCanRead(tx, ctx, employeeId);
        return employeeView(tx, ctx.workspaceId, employeeId);
      }),

    /** The signed-in employee's own schedule (mobile profile). */
    getOwn: (ctx: AuthContext): Promise<EmployeeWorkSchedule> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        if (!ctx.employeeId || !(await repo.employeesByIds(tx, ctx.workspaceId, [ctx.employeeId])).length) throw notFound('no_employee_profile');
        return employeeView(tx, ctx.workspaceId, ctx.employeeId);
      }),
  };
};
export type SchedulesService = ReturnType<typeof createSchedulesService>;
