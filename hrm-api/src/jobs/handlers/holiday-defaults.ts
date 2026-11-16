import type { Db } from '../../db/client';
import { DEFAULT_TIME_ZONE, todayInTimeZone } from '../../lib/dates';
import { auditRepository } from '../../modules/audit/audit.repository';
import { ensureHolidayYear } from '../../modules/holidays/holidays.repository';

export interface HolidayDefaultsRunResult {
  years: number[];
  created: number;
}

/**
 * Monthly holiday-calendar upkeep for one workspace (FR-WS-04.1): make sure the current year
 * (in the workspace timezone) has the statutory defaults, and from December on the next year too,
 * so HR can plan ahead. `ensureHolidayYear` is idempotent, so re-runs and overlapping ticks are harmless.
 */
export const runHolidayDefaults = (db: Db, workspaceId: string, now: Date = new Date()): Promise<HolidayDefaultsRunResult> =>
  db.tenant(workspaceId, async (tx) => {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
    if (!workspace) return { years: [], created: 0 };
    const today = todayInTimeZone(workspace.timezone || DEFAULT_TIME_ZONE, now);
    const year = Number(today.slice(0, 4));
    const years = today.slice(5, 7) === '12' ? [year, year + 1] : [year];

    let created = 0;
    for (const y of years) {
      const count = await ensureHolidayYear(tx, workspaceId, y);
      if (count > 0) {
        await auditRepository.create(tx, {
          workspaceId,
          actorUserId: null,
          action: 'holiday.defaults_added',
          entity: 'Holiday',
          entityId: workspaceId,
          meta: { year: y, created: count, source: 'job' },
        });
      }
      created += count;
    }
    return { years, created };
  });
