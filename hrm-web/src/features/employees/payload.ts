import type { CreateEmployeeInput, UpdateEmployeeInput } from '@hrm/shared';

/** Raw values held by the employee form (inputs give strings; blanks are ""). */
export type EmployeeFormValues = Omit<CreateEmployeeInput, 'login'> & {
  createLogin?: boolean;
  loginMethod?: 'PIN' | 'PASSWORD';
  /** Edit only: effective date for the employment-history entry. */
  effectiveDate?: string;
};

/** Fields that may be left blank: omitted on create, cleared (null) on edit. */
export const OPTIONAL_EMPLOYEE_FIELDS = [
  'firstNameEn',
  'lastNameEn',
  'nickname',
  'dateOfBirth',
  'phone',
  'email',
  'address',
  'village',
  'district',
  'province',
  'nationality',
  'idCardNo',
  'socialSecurityNo',
  'ssnRegisteredAt',
  'familyBookNo',
  'familyBookHolder',
  'contractEndDate',
  'probationEndDate',
  'branchId',
  'departmentId',
  'positionId',
  'managerId',
] as const satisfies readonly (keyof EmployeeFormValues)[];

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

const FORM_ONLY = new Set(['createLogin', 'loginMethod', 'effectiveDate']);
const OPTIONAL = new Set<string>(OPTIONAL_EMPLOYEE_FIELDS);

/** POST body: blanks are dropped, the login is added when requested. */
export const toCreatePayload = (values: EmployeeFormValues): CreateEmployeeInput => {
  const body = Object.fromEntries(Object.entries(values).filter(([k, v]) => !FORM_ONLY.has(k) && !isBlank(v)));
  return {
    ...(body as CreateEmployeeInput),
    ...(values.createLogin ? { login: { method: values.loginMethod ?? 'PIN' } } : {}),
  };
};

/** Every editable field as the PATCH API understands it: blank optional fields become `null` (clear). */
export const toUpdateFields = (values: EmployeeFormValues): UpdateEmployeeInput => {
  const body: Record<string, unknown> = Object.fromEntries(OPTIONAL_EMPLOYEE_FIELDS.map((k) => [k, null]));
  for (const [k, v] of Object.entries(values)) {
    if (FORM_ONLY.has(k)) continue;
    if (isBlank(v)) {
      if (OPTIONAL.has(k)) body[k] = null;
    } else body[k] = v;
  }
  body.isTopLevel = !!values.isTopLevel;
  if (!isBlank(values.effectiveDate)) body.effectiveDate = values.effectiveDate;
  return body as UpdateEmployeeInput;
};

/**
 * PATCH body: only fields that differ from what was loaded. Untouched fields are omitted
 * ("unchanged"), so a masked identifier that was never shown is not cleared by accident.
 */
export const toUpdatePayload = (values: EmployeeFormValues, initial: EmployeeFormValues): UpdateEmployeeInput => {
  const next = toUpdateFields(values) as Record<string, unknown>;
  const before = toUpdateFields(initial) as Record<string, unknown>;
  const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => k === 'effectiveDate' || v !== before[k]));
  // Keep the pair together so the API can check "foreign worker needs a country".
  if ('nationality' in changed || 'nationalityType' in changed) {
    changed.nationalityType = next.nationalityType;
    changed.nationality = next.nationality;
  }
  // Same for the line manager: a manager and the top-level flag always travel together, so the API sees the whole picture.
  if ('managerId' in changed || 'isTopLevel' in changed) {
    changed.managerId = next.managerId;
    changed.isTopLevel = next.isTopLevel;
  }
  if (Object.keys(changed).length === 1 && 'effectiveDate' in changed) return {};
  return changed as UpdateEmployeeInput;
};
