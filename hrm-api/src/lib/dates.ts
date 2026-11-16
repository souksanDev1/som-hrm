/** Parse an ISO date (YYYY-MM-DD) into a UTC-midnight Date for @db.Date columns. */
export const parseIsoDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

export const toIsoDate = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

export const optionalDate = (iso: string | undefined): Date | undefined => (iso ? parseIsoDate(iso) : undefined);

/** Workspaces default to Lao time (schema default of Workspace.timezone). */
export const DEFAULT_TIME_ZONE = 'Asia/Vientiane';

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f;
};

/**
 * The calendar date (YYYY-MM-DD) of `instant` as seen in `timeZone` (A12: store UTC instants,
 * derive work dates with the workspace timezone). Throws RangeError for an unknown zone.
 */
export const toWorkDate = (instant: Date, timeZone: string): string => {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

/** Today's date (YYYY-MM-DD) in `timeZone`. */
export const todayInTimeZone = (timeZone: string, now: Date = new Date()): string => toWorkDate(now, timeZone);
