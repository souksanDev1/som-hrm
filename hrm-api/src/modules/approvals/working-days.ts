import { holidaysFor, scheduledHoursOn } from '@hrm/shared';
import type { Tx } from '../../db/client';
import { parseIsoDate, toIsoDate } from '../../lib/dates';
import { holidaysRepository } from '../holidays/holidays.repository';
import { resolveEmployeeWorkPattern } from '../schedules/schedules.service';
import { approvalsRepository as repo } from './approvals.repository';

const addDays = (iso: string, n: number) => toIsoDate(new Date(parseIsoDate(iso).getTime() + n * 86_400_000))!;

/** Safety bound on the days scanned (a pattern without working days would otherwise scan forever). */
const MAX_SCAN_DAYS = 366;

/**
 * Working days of one employee strictly between `from` and `to` (YYYY-MM-DD), counting at most
 * `cap`: days their schedule in force on that date has hours (M3 `resolveEmployeeWorkPattern`) and
 * that are not one of their holidays (`holidaysFor`: women-only and nationality rules applied).
 * Used to age pending approvals (FR-ORG-05.1).
 */
export const workingDaysBetween = async (tx: Tx, workspaceId: string, employeeId: string, from: string, to: string, cap: number): Promise<number> => {
  const first = addDays(from, 1);
  if (first >= to || cap <= 0) return 0;
  const last = addDays(to, -1);
  const employee = (await holidaysRepository.employeeRuleFields(tx, workspaceId, employeeId)) ?? { gender: 'OTHER', nationality: null };
  const rows = await repo.holidaysBetween(tx, workspaceId, parseIsoDate(first), parseIsoDate(last));
  const holidays = new Set(
    holidaysFor(employee, rows.map((h) => ({ date: toIsoDate(h.date)!, womenOnly: h.womenOnly, nationality: h.nationality })), { from: first, to: last }).map(
      (h) => h.date,
    ),
  );

  let count = 0;
  for (let day = first, scanned = 0; day <= last && count < cap && scanned < MAX_SCAN_DAYS; day = addDays(day, 1), scanned++) {
    if (holidays.has(day)) continue;
    const pattern = await resolveEmployeeWorkPattern(tx, workspaceId, employeeId, day);
    if (scheduledHoursOn(pattern.dayHours, day) > 0) count++;
  }
  return count;
};
