import { z } from 'zod';
import { HOLIDAY_KINDS, HolidayKind } from '../enums';
import { emptyToNull, isoDateSchema } from './common';

/** Calendar years the holiday API accepts. */
export const HOLIDAY_YEAR = { min: 2000, max: 2100 } as const;
const yearSchema = z.coerce.number().int().min(HOLIDAY_YEAR.min, 'invalid_year').max(HOLIDAY_YEAR.max, 'invalid_year');

/** YYYY-MM-DD that is also a real calendar day (isoDateSchema alone accepts 2030-13-40). */
const calendarDateSchema = isoDateSchema.refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}, 'invalid_date');

const holidayFields = z.object({
  date: calendarDateSchema,
  nameLo: z.string().trim().min(1, 'required').max(120),
  nameEn: z.string().trim().min(1, 'required').max(120),
  kind: z.enum(HOLIDAY_KINDS).default(HolidayKind.PUBLIC),
  /** Only female employees get the day off (8 March). */
  womenOnly: z.boolean().default(false),
  /** Only employees of this nationality get the day (FR-WS-05); empty = everyone. */
  nationality: emptyToNull(z.string().trim().max(60)),
});

/** A national day is per nationality: it needs one (FR-WS-05). */
const nationalDayNeedsNationality = (v: { kind?: string; nationality?: string | null }) =>
  v.kind !== HolidayKind.NATIONAL_DAY || !!v.nationality;
const nationalityRequired = { message: 'nationality_required', path: ['nationality'] };

export const createHolidaySchema = holidayFields.refine(nationalDayNeedsNationality, nationalityRequired);
export type CreateHolidayInput = z.input<typeof createHolidaySchema>;
/** Parsed (validated) create body, as the API receives it. */
export type CreateHolidayData = z.output<typeof createHolidaySchema>;
/** Partial update; the API re-checks kind/nationality against the stored row. */
export const updateHolidaySchema = holidayFields.partial();
export type UpdateHolidayInput = z.input<typeof updateHolidaySchema>;
export type UpdateHolidayData = z.output<typeof updateHolidaySchema>;

export const holidaySchema = z.object({
  id: z.string(),
  date: z.string(),
  nameLo: z.string(),
  nameEn: z.string(),
  kind: z.enum(HOLIDAY_KINDS),
  womenOnly: z.boolean(),
  nationality: z.string().nullable(),
  isDefault: z.boolean(),
});
export type Holiday = z.infer<typeof holidaySchema>;

export const holidayListQuerySchema = z.object({ year: yearSchema });
export type HolidayListQuery = z.infer<typeof holidayListQuerySchema>;

export const ensureHolidayYearSchema = z.object({ year: yearSchema });
export type EnsureHolidayYearInput = z.input<typeof ensureHolidayYearSchema>;
export const ensureHolidayYearResultSchema = z.object({ year: z.number().int(), created: z.number().int() });
export type EnsureHolidayYearResult = z.infer<typeof ensureHolidayYearResultSchema>;
