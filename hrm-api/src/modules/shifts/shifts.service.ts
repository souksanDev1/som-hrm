import {
  isoDateInTimeZone,
  minutesToHours,
  PERMISSIONS,
  resolveWorkPattern,
  scheduledHoursOn,
  shiftCrossesMidnight,
  shiftNetMinutes,
  validateShift,
  ROSTER_MAX_DAYS,
  type ClearRosterInput,
  type CreateShiftInput,
  type RosterCell,
  type RosterQuery,
  type RosterView,
  type RosterWriteResult,
  type ScheduleAssignmentInput,
  type SetRosterInput,
  type Shift,
  type ShiftDeleteResult,
  type StandardScheduleVersionInput,
  type UpdateShiftInput,
} from '@hrm/shared';
import type { Shift as ShiftRow } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { recomputeAttendanceDays } from '../attendance/attendance-days';
import { workspaceTimeZone } from '../attendance/day-context';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { schedulesRepository } from '../schedules/schedules.repository';
import { attendanceScope, assertInScope, datesBetween, employeeName } from './attendance-scope';
import { shiftsRepository as repo } from './shifts.repository';

interface RequestMeta {
  ip?: string;
}

const iso = (d: Date) => toIsoDate(d)!;

export const toShiftView = (s: ShiftRow, inUse: boolean): Shift => ({
  id: s.id,
  name: s.name,
  code: s.code,
  color: s.color,
  startTime: s.startTime,
  endTime: s.endTime,
  breakMinutes: s.breakMinutes,
  lateGraceMinutes: s.lateGraceMinutes,
  earlyGraceMinutes: s.earlyGraceMinutes,
  isActive: s.isActive,
  crossesMidnight: shiftCrossesMidnight(s),
  netMinutes: shiftNetMinutes(s),
  inUse,
});

/** Authoritative shift check (shared `validateShift`, FR-ATT-17.1/17.2); the error code names the field. */
const assertValidShift = (s: Pick<ShiftRow, 'startTime' | 'endTime' | 'breakMinutes'>) => {
  const error = validateShift(s);
  if (error) throw badRequest(error, { field: error === 'shift_break_too_long' ? 'breakMinutes' : 'endTime' });
};

const assertNameFree = async (tx: Tx, workspaceId: string, name: string, exceptId?: string) => {
  const other = await repo.findByName(tx, workspaceId, name);
  if (other && other.id !== exceptId) throw conflict('shift_name_taken', { field: 'name' });
};

/** Dates of `cells` that are today or earlier, grouped by employee: those days already have (or may have) results. */
const pastDatesByEmployee = (cells: readonly { employeeId: string; date: string }[], today: string) => {
  const map = new Map<string, Set<string>>();
  for (const c of cells) if (c.date <= today) map.set(c.employeeId, (map.get(c.employeeId) ?? new Set()).add(c.date));
  return map;
};

export const createShiftsService = (db: Db) => {
  const view = async (tx: Tx, workspaceId: string, s: ShiftRow) => toShiftView(s, (await repo.usedIds(tx, workspaceId, [s.id])).has(s.id));

  /** Recompute already-started dates touched by a roster write (FR-ATT-17.3 → FR-ATT-18). */
  const recomputeTouched = async (tx: Tx, workspaceId: string, cells: readonly { employeeId: string; date: string }[]) => {
    const today = isoDateInTimeZone(await workspaceTimeZone(tx, workspaceId));
    let recomputed = 0;
    for (const [employeeId, dates] of pastDatesByEmployee(cells, today)) {
      await recomputeAttendanceDays(tx, workspaceId, employeeId, [...dates]);
      recomputed += dates.size;
    }
    return recomputed;
  };

  /** Roster writes may only touch employees in the caller's scope and dates inside one roster window. */
  const assertCellsAllowed = async (tx: Tx, ctx: AuthContext, cells: readonly { employeeId: string; date: string }[]) => {
    const scope = await attendanceScope(tx, ctx);
    const ids = [...new Set(cells.map((c) => c.employeeId))];
    const found = await tx.employee.findMany({ where: { workspaceId: ctx.workspaceId, id: { in: ids } }, select: { id: true } });
    if (found.length !== ids.length) throw notFound();
    for (const id of ids) assertInScope(scope, id);
  };

  return {
    async list(ctx: AuthContext, activeOnly: boolean): Promise<Shift[]> {
      return db.tenant(ctx.workspaceId, async (tx) => {
        const rows = await repo.list(tx, ctx.workspaceId, activeOnly);
        const used = await repo.usedIds(tx, ctx.workspaceId, rows.map((r) => r.id));
        return rows.map((r) => toShiftView(r, used.has(r.id)));
      });
    },

    async create(ctx: AuthContext, input: CreateShiftInput, meta: RequestMeta = {}): Promise<Shift> {
      return db.tenant(ctx.workspaceId, async (tx) => {
        assertValidShift(input);
        await assertNameFree(tx, ctx.workspaceId, input.name);
        const row = await tx.shift.create({
          data: {
            workspaceId: ctx.workspaceId,
            name: input.name,
            code: input.code || null,
            color: input.color ?? null,
            startTime: input.startTime,
            endTime: input.endTime,
            breakMinutes: input.breakMinutes,
            lateGraceMinutes: input.lateGraceMinutes ?? null,
            earlyGraceMinutes: input.earlyGraceMinutes ?? null,
          },
        });
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'shift.create', entity: 'Shift', entityId: row.id, ip: meta.ip,
          meta: { name: row.name, startTime: row.startTime, endTime: row.endTime, breakMinutes: row.breakMinutes },
        });
        return toShiftView(row, false);
      });
    },

    /**
     * Edit a shift. Days already computed keep their stored result until something recomputes them (punch,
     * roster change, daily job for yesterday/today), so the past is not silently rewritten.
     */
    async update(ctx: AuthContext, id: string, input: UpdateShiftInput, meta: RequestMeta = {}): Promise<Shift> {
      return db.tenant(ctx.workspaceId, async (tx) => {
        const current = await repo.findById(tx, ctx.workspaceId, id);
        if (!current) throw notFound();
        const next = {
          name: input.name ?? current.name,
          code: input.code === undefined ? current.code : input.code || null,
          color: input.color === undefined ? current.color : input.color,
          startTime: input.startTime ?? current.startTime,
          endTime: input.endTime ?? current.endTime,
          breakMinutes: input.breakMinutes ?? current.breakMinutes,
          lateGraceMinutes: input.lateGraceMinutes === undefined ? current.lateGraceMinutes : input.lateGraceMinutes,
          earlyGraceMinutes: input.earlyGraceMinutes === undefined ? current.earlyGraceMinutes : input.earlyGraceMinutes,
          isActive: input.isActive ?? current.isActive,
        };
        assertValidShift(next);
        if (next.name !== current.name) await assertNameFree(tx, ctx.workspaceId, next.name, id);
        const row = await tx.shift.update({ where: { id }, data: next });
        const changed = Object.fromEntries(
          Object.entries(next).filter(([k, v]) => current[k as keyof typeof next] !== v).map(([k, v]) => [k, { old: current[k as keyof typeof next], new: v }]),
        );
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'shift.update', entity: 'Shift', entityId: id, ip: meta.ip, meta: { changed },
        });
        return view(tx, ctx.workspaceId, row);
      });
    },

    /** Delete an unused shift; a shift used by a schedule, the roster or a computed day is deactivated instead. */
    async remove(ctx: AuthContext, id: string, meta: RequestMeta = {}): Promise<ShiftDeleteResult> {
      return db.tenant(ctx.workspaceId, async (tx) => {
        const current = await repo.findById(tx, ctx.workspaceId, id);
        if (!current) throw notFound();
        const inUse = (await repo.usedIds(tx, ctx.workspaceId, [id])).has(id);
        if (inUse) await tx.shift.update({ where: { id }, data: { isActive: false } });
        else await tx.shift.delete({ where: { id } });
        const result = inUse ? 'deactivated' : 'deleted';
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: `shift.${inUse ? 'deactivate' : 'delete'}`, entity: 'Shift', entityId: id,
          ip: meta.ip, meta: { name: current.name },
        });
        return { result };
      });
    },

    /**
     * Roster grid (FR-ATT-17.3): every employed employee in the caller's scope × every date of the range, with the
     * rostered shift, else the work schedule's (rest days = null).
     */
    async roster(ctx: AuthContext, q: RosterQuery): Promise<RosterView> {
      const dates = datesBetween(q.from, q.to);
      if (dates.length > ROSTER_MAX_DAYS) throw badRequest('range_too_long', { field: 'to', maxDays: ROSTER_MAX_DAYS });
      return db.tenant(ctx.workspaceId, async (tx) => {
        const scope = await attendanceScope(tx, ctx);
        const employees = await repo.rosterEmployees(tx, ctx.workspaceId, scope, q.departmentId);
        const ids = employees.map((e) => e.id);
        const [rows, standards, assignments] = await Promise.all([
          repo.rosterRows(tx, ctx.workspaceId, ids, parseIsoDate(q.from), parseIsoDate(q.to)),
          schedulesRepository.listStandardVersions(tx, ctx.workspaceId),
          ids.length ? schedulesRepository.listAssignments(tx, ctx.workspaceId, ids) : Promise.resolve([]),
        ]);
        const scheduleIds = [...new Set([...standards.map((s) => s.id), ...assignments.flatMap((a) => (a.schedule ? [a.schedule.id] : []))])];
        const scheduleShift = new Map(
          (await tx.workSchedule.findMany({ where: { workspaceId: ctx.workspaceId, id: { in: scheduleIds } }, select: { id: true, shiftId: true } })).map((s) => [s.id, s.shiftId]),
        );
        const standardInputs: StandardScheduleVersionInput[] = standards.map((v) => ({ id: v.id, effectiveFrom: iso(v.effectiveFrom!), dayHours: minutesToHours(v.dayMinutes) }));
        const assignmentsByEmployee = new Map<string, ScheduleAssignmentInput[]>();
        for (const a of assignments) {
          const list = assignmentsByEmployee.get(a.employeeId) ?? [];
          list.push({ effectiveFrom: iso(a.effectiveFrom), schedule: a.schedule ? { id: a.schedule.id, dayHours: minutesToHours(a.schedule.dayMinutes) } : null });
          assignmentsByEmployee.set(a.employeeId, list);
        }
        const rostered = new Map(rows.map((r) => [`${r.employeeId}|${iso(r.date)}`, r]));

        const cells: RosterCell[] = [];
        for (const e of employees) {
          for (const date of dates) {
            const r = rostered.get(`${e.id}|${date}`);
            if (r) {
              cells.push({ employeeId: e.id, date, shiftId: r.shiftId, source: 'ROSTER' });
              continue;
            }
            const pattern = resolveWorkPattern(date, standardInputs, assignmentsByEmployee.get(e.id) ?? []);
            const working = pattern ? scheduledHoursOn(pattern.dayHours, date) > 0 : false;
            cells.push({ employeeId: e.id, date, shiftId: working ? (scheduleShift.get(pattern!.scheduleId) ?? null) : null, source: 'SCHEDULE' });
          }
        }
        return {
          from: q.from,
          to: q.to,
          employees: employees.map((e) => ({ id: e.id, employeeCode: e.employeeCode, name: employeeName(e), departmentName: e.department?.name ?? null })),
          cells,
        };
      });
    },

    /** Set roster cells (shiftId null = rostered rest day), then recompute dates that have started. Audited. */
    async setRoster(ctx: AuthContext, input: SetRosterInput, meta: RequestMeta = {}): Promise<RosterWriteResult> {
      return db.tenant(ctx.workspaceId, async (tx) => {
        await assertCellsAllowed(tx, ctx, input.cells);
        const shiftIds = [...new Set(input.cells.flatMap((c) => (c.shiftId ? [c.shiftId] : [])))];
        const shifts = shiftIds.length ? await tx.shift.findMany({ where: { workspaceId: ctx.workspaceId, id: { in: shiftIds } } }) : [];
        if (shifts.length !== shiftIds.length) throw badRequest('shift_not_found', { field: 'shiftId' });
        if (shifts.some((s) => !s.isActive)) throw badRequest('shift_inactive', { field: 'shiftId' });

        const unique = new Map(input.cells.map((c) => [`${c.employeeId}|${c.date}`, c]));
        for (const c of unique.values()) {
          await tx.shiftRoster.upsert({
            where: { employeeId_date: { employeeId: c.employeeId, date: parseIsoDate(c.date) } },
            create: { workspaceId: ctx.workspaceId, employeeId: c.employeeId, date: parseIsoDate(c.date), shiftId: c.shiftId, createdById: ctx.userId },
            update: { shiftId: c.shiftId, createdById: ctx.userId },
          });
        }
        const cells = [...unique.values()];
        const recomputed = await recomputeTouched(tx, ctx.workspaceId, cells);
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'roster.set', entity: 'ShiftRoster', ip: meta.ip,
          meta: { count: cells.length, cells: cells.slice(0, 200) },
        });
        return { updated: cells.length, recomputed };
      });
    },

    /** Clear roster cells: those dates go back to the work schedule. */
    async clearRoster(ctx: AuthContext, input: ClearRosterInput, meta: RequestMeta = {}): Promise<RosterWriteResult> {
      return db.tenant(ctx.workspaceId, async (tx) => {
        await assertCellsAllowed(tx, ctx, input.cells);
        const { count } = await tx.shiftRoster.deleteMany({
          where: { workspaceId: ctx.workspaceId, OR: input.cells.map((c) => ({ employeeId: c.employeeId, date: parseIsoDate(c.date) })) },
        });
        const recomputed = await recomputeTouched(tx, ctx.workspaceId, input.cells);
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'roster.clear', entity: 'ShiftRoster', ip: meta.ip,
          meta: { count, cells: input.cells.slice(0, 200) },
        });
        return { updated: count, recomputed };
      });
    },
  };
};

export type ShiftsService = ReturnType<typeof createShiftsService>;

/** Permissions that may read the shift list (pickers in schedule settings and attendance screens). */
export const SHIFT_READ_PERMISSIONS = [PERMISSIONS.SHIFT_MANAGE, PERMISSIONS.SCHEDULE_MANAGE, PERMISSIONS.ATTENDANCE_READ_ALL] as const;

