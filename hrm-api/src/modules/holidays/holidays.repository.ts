import { defaultHolidaysForYear } from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';
import { parseIsoDate } from '../../lib/dates';

const yearBounds = (year: number) => ({ gte: parseIsoDate(`${year}-01-01`), lte: parseIsoDate(`${year}-12-31`) });

export const holidaysRepository = {
  listByYear: (tx: Tx, workspaceId: string, year: number) =>
    tx.holiday.findMany({ where: { workspaceId, date: yearBounds(year) }, orderBy: { date: 'asc' } }),
  find: (tx: Tx, workspaceId: string, id: string) => tx.holiday.findFirst({ where: { id, workspaceId } }),
  create: (tx: Tx, data: Prisma.HolidayUncheckedCreateInput) => tx.holiday.create({ data }),
  update: (tx: Tx, workspaceId: string, id: string, data: Prisma.HolidayUpdateInput) => tx.holiday.update({ where: { id, workspaceId }, data }),
  delete: (tx: Tx, workspaceId: string, id: string) => tx.holiday.deleteMany({ where: { id, workspaceId } }),
  yearHasDefaults: (tx: Tx, workspaceId: string, year: number) =>
    tx.holiday.count({ where: { workspaceId, isDefault: true, date: yearBounds(year) } }),
  employeeRuleFields: (tx: Tx, workspaceId: string, id: string) =>
    tx.employee.findFirst({ where: { id, workspaceId }, select: { gender: true, nationality: true } }),
};

/**
 * Give `year` the statutory default holidays (FR-WS-04.1/04.2) unless it already has some.
 *
 * Idempotent: a year that holds any default row counts as seeded, so HR deleting one default is
 * respected; `skipDuplicates` keeps dates HR already filled with their own entry. Works inside
 * `db.tenant` and `db.system`. Returns the number of rows created.
 */
export const ensureHolidayYear = async (tx: Tx, workspaceId: string, year: number): Promise<number> => {
  if ((await holidaysRepository.yearHasDefaults(tx, workspaceId, year)) > 0) return 0;
  const { count } = await tx.holiday.createMany({
    data: defaultHolidaysForYear(year).map((h) => ({
      workspaceId,
      date: parseIsoDate(h.date),
      nameLo: h.nameLo,
      nameEn: h.nameEn,
      kind: h.kind,
      womenOnly: h.womenOnly,
      nationality: h.nationality,
      isDefault: true,
    })),
    skipDuplicates: true,
  });
  return count;
};
