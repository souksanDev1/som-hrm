import type {
  CreateLeaveTypeInput,
  Gender,
  LeaveCountingMethod,
  LeaveQuotaPeriod,
  LeavePolicyViolation,
  LeaveType,
  LeaveTypeUpdateRequest,
  PayType,
} from '@hrm/shared';

/** Leave type form as typed (numbers as text so a field can be empty). */
export interface LeaveTypeFormValues {
  code: string;
  nameLo: string;
  nameEn: string;
  countingMethod: LeaveCountingMethod;
  quotaPeriod: LeaveQuotaPeriod;
  gender: Gender | '';
  daysPerYear: string;
  hazardousDays: string;
  multipleBirthDays: string;
  minServiceDays: string;
  minServicePayTypes: PayType[];
  paid: boolean;
  requiresAttachment: boolean;
  allowHalfDay: boolean;
  isActive: boolean;
}

export type LeaveTypeFormField = keyof LeaveTypeFormValues;
export type LeaveTypeFormErrors = Partial<Record<LeaveTypeFormField, string>>;

export const emptyLeaveTypeValues = (): LeaveTypeFormValues => ({
  code: '',
  nameLo: '',
  nameEn: '',
  countingMethod: 'WORKING_DAYS',
  quotaPeriod: 'YEARLY',
  gender: '',
  daysPerYear: '',
  hazardousDays: '',
  multipleBirthDays: '',
  minServiceDays: '0',
  minServicePayTypes: [],
  paid: true,
  requiresAttachment: false,
  allowHalfDay: true,
  isActive: true,
});

const text = (n: number | null) => (n === null ? '' : String(n));

export const leaveTypeFormValues = (t: LeaveType): LeaveTypeFormValues => ({
  code: t.code,
  nameLo: t.nameLo,
  nameEn: t.nameEn,
  countingMethod: t.countingMethod,
  quotaPeriod: t.quotaPeriod,
  gender: t.gender ?? '',
  daysPerYear: text(t.policy.daysPerYear),
  hazardousDays: text(t.policy.hazardousDays),
  multipleBirthDays: text(t.policy.multipleBirthDays),
  minServiceDays: String(t.policy.minServiceDays),
  minServicePayTypes: [...t.policy.minServicePayTypes],
  paid: t.paid,
  requiresAttachment: t.requiresAttachment,
  allowHalfDay: t.allowHalfDay,
  isActive: t.isActive,
});

const NUMBER_RE = /^\d+(\.\d+)?$/;

export type ParsedLeaveType =
  | { ok: true; create: CreateLeaveTypeInput; update: LeaveTypeUpdateRequest }
  | { ok: false; errors: LeaveTypeFormErrors };

/**
 * Shape checks only (required, number format); policy rules such as the legal minimum are the API's
 * (400 `below_legal_minimum`, shown by `violationField`).
 */
export const parseLeaveTypeForm = (v: LeaveTypeFormValues, mode: 'create' | 'edit'): ParsedLeaveType => {
  const errors: LeaveTypeFormErrors = {};
  if (mode === 'create' && !/^[A-Z0-9_]{2,20}$/.test(v.code.trim())) errors.code = v.code.trim() ? 'leave_type_code_format' : 'required';
  if (!v.nameLo.trim()) errors.nameLo = 'required';
  if (!v.nameEn.trim()) errors.nameEn = 'required';
  const num = (field: 'daysPerYear' | 'hazardousDays' | 'multipleBirthDays' | 'minServiceDays', optional: boolean): number | null => {
    const raw = v[field].trim();
    if (!raw) {
      if (!optional) errors[field] = 'required';
      return null;
    }
    if (!NUMBER_RE.test(raw)) {
      errors[field] = 'out_of_range';
      return null;
    }
    const n = Number(raw);
    if (field === 'minServiceDays' ? !Number.isInteger(n) : !Number.isInteger(n * 2)) errors[field] = field === 'minServiceDays' ? 'out_of_range' : 'leave_days_half_step';
    return n;
  };
  const daysPerYear = num('daysPerYear', false);
  const hazardousDays = num('hazardousDays', true);
  const multipleBirthDays = num('multipleBirthDays', true);
  const minServiceDays = num('minServiceDays', false);
  if (Object.keys(errors).length) return { ok: false, errors };

  const update: LeaveTypeUpdateRequest = {
    nameLo: v.nameLo.trim(),
    nameEn: v.nameEn.trim(),
    paid: v.paid,
    requiresAttachment: v.requiresAttachment,
    allowHalfDay: v.allowHalfDay,
    isActive: v.isActive,
    policy: { daysPerYear: daysPerYear!, hazardousDays, multipleBirthDays, minServiceDays: minServiceDays!, minServicePayTypes: v.minServicePayTypes },
  };
  const create: CreateLeaveTypeInput = {
    ...update,
    code: v.code.trim(),
    countingMethod: v.countingMethod,
    quotaPeriod: v.quotaPeriod,
    gender: v.gender || null,
  };
  return { ok: true, create, update };
};

/** The form field an API `below_legal_minimum` violation points at (details `{ field, legalMin }`). */
export const violationOf = (details: unknown): LeavePolicyViolation | null => {
  const d = details as Partial<LeavePolicyViolation> | undefined;
  return d && typeof d.field === 'string' && typeof d.legalMin === 'number' ? { field: d.field, legalMin: d.legalMin } : null;
};
