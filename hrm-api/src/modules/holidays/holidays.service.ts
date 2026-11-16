import {
  type CreateHolidayData,
  type EnsureHolidayYearResult,
  type Holiday,
  HolidayKind,
  holidaysFor,
  type UpdateHolidayData,
  yearRange,
} from '@hrm/shared';
import type { Holiday as HolidayRow, Prisma } from '@prisma/client';
import type { Db, Tx } from '../../db/client';
import { isUniqueViolation } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { changedFields } from '../org/org.service';
import { ensureHolidayYear, holidaysRepository as repo } from './holidays.repository';

export const toHoliday = (h: HolidayRow): Holiday => ({
  id: h.id,
  date: toIsoDate(h.date)!,
  nameLo: h.nameLo,
  nameEn: h.nameEn,
  kind: h.kind,
  womenOnly: h.womenOnly,
  nationality: h.nationality,
  isDefault: h.isDefault,
});

/** One holiday per date per workspace: a duplicate date is a stable 409. */
const guardDate = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('date_taken');
    throw err;
  }
};

/** Holiday calendar (FR-WS-04/05). Reads need org.read, changes org.write (guarded in the routes). */
export const createHolidaysService = (db: Db) => {
  const audit = (tx: Tx, ctx: AuthContext, action: string, entityId: string, meta?: Prisma.InputJsonValue) =>
    auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action, entity: 'Holiday', entityId, meta });

  return {
    list: (ctx: AuthContext, year: number) =>
      db.tenant(ctx.workspaceId, async (tx) => (await repo.listByYear(tx, ctx.workspaceId, year)).map(toHoliday)),

    /**
     * The caller's own holidays: women-only and nationality rules applied via `holidaysFor`.
     * A user without an employee record gets the days that apply to everyone.
     */
    listMine: (ctx: AuthContext, year: number) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const all = (await repo.listByYear(tx, ctx.workspaceId, year)).map(toHoliday);
        const employee = ctx.employeeId ? await repo.employeeRuleFields(tx, ctx.workspaceId, ctx.employeeId) : null;
        return holidaysFor(employee ?? { gender: 'OTHER', nationality: null }, all, yearRange(year));
      }),

    create: (ctx: AuthContext, input: CreateHolidayData) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const h = await guardDate(() =>
          repo.create(tx, {
            workspaceId: ctx.workspaceId,
            date: parseIsoDate(input.date),
            nameLo: input.nameLo,
            nameEn: input.nameEn,
            kind: input.kind,
            womenOnly: input.womenOnly,
            nationality: input.nationality ?? null,
          }),
        );
        const view = toHoliday(h);
        await audit(tx, ctx, 'holiday.created', h.id, { date: view.date, nameEn: view.nameEn, kind: view.kind, nationality: view.nationality });
        return view;
      }),

    update: (ctx: AuthContext, id: string, input: UpdateHolidayData) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const row = await repo.find(tx, ctx.workspaceId, id);
        if (!row) throw notFound();
        const before = toHoliday(row);
        const kind = input.kind ?? before.kind;
        const nationality = input.nationality === undefined ? before.nationality : input.nationality;
        if (kind === HolidayKind.NATIONAL_DAY && !nationality) throw badRequest('nationality_required', { fields: ['nationality'] });
        const { date, ...rest } = input;
        const h = await guardDate(() => repo.update(tx, ctx.workspaceId, id, { ...rest, ...(date ? { date: parseIsoDate(date) } : {}) }));
        await audit(tx, ctx, 'holiday.updated', id, { changes: changedFields(before, input) } as Prisma.InputJsonValue);
        return toHoliday(h);
      }),

    delete: (ctx: AuthContext, id: string) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const row = await repo.find(tx, ctx.workspaceId, id);
        if (!row) throw notFound();
        await repo.delete(tx, ctx.workspaceId, id);
        await audit(tx, ctx, 'holiday.deleted', id, { date: toIsoDate(row.date), nameEn: row.nameEn });
      }),

    /** Add the statutory defaults to `year` if it has none yet (idempotent). */
    ensureYear: (ctx: AuthContext, year: number): Promise<EnsureHolidayYearResult> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const created = await ensureHolidayYear(tx, ctx.workspaceId, year);
        if (created > 0) await audit(tx, ctx, 'holiday.defaults_added', ctx.workspaceId, { year, created });
        return { year, created };
      }),
  };
};
export type HolidaysService = ReturnType<typeof createHolidaysService>;
