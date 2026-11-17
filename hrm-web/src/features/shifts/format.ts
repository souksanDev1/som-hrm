import { addDays, type AttendanceStatus } from '@hrm/shared';
import type { BadgeTone } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';

type Translate = (key: string) => string;

/** Badge colour per day status (display only; the status itself comes from the API). */
export const STATUS_TONE: Record<AttendanceStatus, BadgeTone> = {
  PRESENT: 'success',
  LATE: 'warning',
  EARLY: 'warning',
  ABSENT: 'danger',
  MISSING_IN: 'danger',
  MISSING_OUT: 'danger',
  HOLIDAY: 'primary',
  REST: 'neutral',
  LEAVE: 'primary',
};

/** "15 min", or "—" for zero. */
export const formatMinutes = (t: Translate, minutes: number): string => (minutes > 0 ? fill(t('attreport.minutes'), { n: minutes }) : '—');

/** "7.5 h" (one decimal at most), or "—" for zero. */
export const formatHoursFromMinutes = (t: Translate, minutes: number): string =>
  minutes > 0 ? fill(t('attreport.hours'), { h: Math.round((minutes / 60) * 10) / 10 }) : '—';

/** Local calendar date of the browser (pickers' default only — the API decides work dates). */
export const todayLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Monday of the week containing `iso`. */
export const mondayOf = (iso: string): string => {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
};

/** The 7 dates of the week starting `monday`. */
export const weekDates = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** Every date from `from` to `to` (inclusive), capped at `max`. */
export const rangeDates = (from: string, to: string, max = 62): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < max; d = addDays(d, 1)) out.push(d);
  return out;
};

/** First and last date of a "YYYY-MM" month. */
export const monthBounds = (month: string): { from: string; to: string } => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
};

/** Short weekday + day number for column headers, e.g. "Mon 17". */
export const dayLabel = (iso: string, locale: string): string =>
  `${new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === 'lo' ? 'lo-LA' : 'en-GB', { weekday: 'short', timeZone: 'UTC' })} ${Number(iso.slice(8))}`;
