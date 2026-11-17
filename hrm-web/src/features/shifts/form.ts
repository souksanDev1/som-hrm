import { createShiftSchema, validateShift, type CreateShiftInput, type Shift } from '@hrm/shared';
import type { FormValues, ParseResult } from '@/features/org/forms';

export const emptyShiftValues = (): FormValues => ({
  name: '',
  code: '',
  color: '',
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: '60',
  lateGraceMinutes: '',
  earlyGraceMinutes: '',
  isActive: 'true',
});

export const shiftFormValues = (s: Shift): FormValues => ({
  name: s.name,
  code: s.code ?? '',
  color: s.color ?? '',
  startTime: s.startTime,
  endTime: s.endTime,
  breakMinutes: String(s.breakMinutes),
  lateGraceMinutes: s.lateGraceMinutes === null ? '' : String(s.lateGraceMinutes),
  earlyGraceMinutes: s.earlyGraceMinutes === null ? '' : String(s.earlyGraceMinutes),
  isActive: s.isActive ? 'true' : '',
});

/** '' → null (use the workspace parameter); otherwise a number (NaN when not numeric, caught by the schema). */
const optionalInt = (raw: string | undefined): number | null => {
  const v = (raw ?? '').trim();
  return v === '' ? null : Number(v);
};

export type ShiftFormData = CreateShiftInput & { isActive: boolean };

/**
 * Validate the shift form with the shared schema and `validateShift` (the API runs the same checks); the full
 * body is sent for create and edit. Error values are translation keys per field.
 */
export const parseShiftForm = (v: FormValues): ParseResult<ShiftFormData> => {
  const body = {
    name: (v.name ?? '').trim(),
    code: v.code?.trim() ? v.code.trim() : null,
    color: v.color?.trim() ? v.color.trim() : null,
    startTime: v.startTime ?? '',
    endTime: v.endTime ?? '',
    breakMinutes: Number((v.breakMinutes ?? '').trim() || '0'),
    lateGraceMinutes: optionalInt(v.lateGraceMinutes),
    earlyGraceMinutes: optionalInt(v.earlyGraceMinutes),
  };
  const errors: Record<string, string> = {};
  const parsed = createShiftSchema.safeParse(body);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      errors[key] ??= /^[a-z_]+$/.test(issue.message) ? issue.message : 'invalid';
    }
    return { ok: false, errors };
  }
  const shiftError = validateShift(body);
  if (shiftError) return { ok: false, errors: { [shiftError === 'shift_break_too_long' ? 'breakMinutes' : 'endTime']: shiftError } };
  return { ok: true, data: { ...parsed.data, isActive: v.isActive === 'true' } };
};
