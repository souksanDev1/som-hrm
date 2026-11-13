/** Parse an ISO date (YYYY-MM-DD) into a UTC-midnight Date for @db.Date columns. */
export const parseIsoDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

export const toIsoDate = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

export const optionalDate = (iso: string | undefined): Date | undefined => (iso ? parseIsoDate(iso) : undefined);
