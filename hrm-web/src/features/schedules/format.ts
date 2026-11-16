import { formatScheduleHours, patternFromWorkingDays, SCHEDULE_DAY_ORDER, type WorkPatternLimits } from '@hrm/shared';
import { fill } from '@/features/settings/parameters/format';

type Translate = (key: string) => string;

/** Shared with mobile (packages/shared work-schedule). */
export const DAY_ORDER = SCHEDULE_DAY_ORDER;
export const formatHours = formatScheduleHours;

/** "6 days · 48 h/week". */
export const formatPatternSummary = (t: Translate, p: { workingDays: readonly number[]; weeklyHours: number }) =>
  fill(t('schedule.weekSummary'), { days: p.workingDays.length, hours: formatHours(p.weeklyHours) });

/** Parse the seven inputs of the editor; `null` when any is not a number. */
export const parseDayHours = (values: readonly string[]): number[] | null => {
  const parsed = values.map((v) => (v.trim() === '' ? 0 : Number(v.trim())));
  return parsed.every((n) => Number.isFinite(n)) ? parsed : null;
};

export type PresetKey = 'sixDays' | 'fiveDays' | 'halfSaturday';
export const PRESET_KEYS: readonly PresetKey[] = ['sixDays', 'fiveDays', 'halfSaturday'];

/** Common patterns, built from the workspace's standard day length. */
export const presetPattern = (key: PresetKey, limits: WorkPatternLimits): number[] => {
  const day = limits.maxHoursPerDay;
  if (key === 'sixDays') return patternFromWorkingDays([1, 2, 3, 4, 5, 6], day);
  const five = patternFromWorkingDays([1, 2, 3, 4, 5], day);
  if (key === 'fiveDays') return five;
  return five.map((h, d) => (d === 6 ? day / 2 : h));
};
