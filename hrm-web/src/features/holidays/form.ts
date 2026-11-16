import { createHolidaySchema, type CreateHolidayInput, type Holiday } from '@hrm/shared';
import type { FormValues, ParseResult } from '@/features/org/forms';

export const emptyHolidayValues = (year: number): FormValues => ({
  date: `${year}-01-01`,
  nameLo: '',
  nameEn: '',
  kind: 'TRADITIONAL',
  womenOnly: '',
  nationality: '',
});

export const holidayFormValues = (h: Holiday): FormValues => ({
  date: h.date,
  nameLo: h.nameLo,
  nameEn: h.nameEn,
  kind: h.kind,
  womenOnly: h.womenOnly ? 'true' : '',
  nationality: h.nationality ?? '',
});

/** Validate with the shared schema (same rules as the API); the full body is sent for create and edit. */
export const parseHolidayForm = (v: FormValues): ParseResult<CreateHolidayInput> => {
  const body = {
    date: v.date ?? '',
    nameLo: v.nameLo ?? '',
    nameEn: v.nameEn ?? '',
    kind: v.kind,
    womenOnly: v.womenOnly === 'true',
    nationality: v.nationality?.trim() ? v.nationality.trim() : null,
  };
  const parsed = createHolidaySchema.safeParse(body);
  if (parsed.success) return { ok: true, data: body as CreateHolidayInput };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= /^[a-z_]+$/.test(issue.message) ? issue.message : 'invalid';
  }
  return { ok: false, errors };
};
