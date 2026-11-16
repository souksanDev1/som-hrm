import { z } from 'zod';
import {
  DOCUMENT_TYPES,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  NATIONALITY_TYPES,
  NationalityType,
} from '../enums';
import { EXPIRY_STATES } from '../domain/documents';
import { storedFileSchema } from './file';
import { emptyToNull, emptyToUndefined, isoDateSchema, laoPhoneSchema, paginationQuerySchema } from './common';

/** Optional text on create: blank → undefined. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
/** Optional text on update: omitted → unchanged, blank or null → null (clear). */
const clearableText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullable().optional());
const optionalDate = emptyToUndefined(isoDateSchema);

/** Lao social-security (ປະກັນສັງຄົມ) number — digits/letters, 6–20 chars. */
export const socialSecurityNoSchema = z.string().trim().regex(/^[A-Za-z0-9-]{6,20}$/, 'invalid_ssn');
/** Family-book (ສຳມະໂນຄົວ) number. */
export const familyBookNoSchema = z.string().trim().regex(/^[A-Za-z0-9/-]{3,30}$/, 'invalid_family_book');
const emailSchema = z.string().trim().toLowerCase().email('invalid_email');

const requiredFields = {
  employeeCode: z.string().trim().regex(/^[A-Za-z0-9-]{1,20}$/, 'invalid_employee_code'),
  firstName: z.string().trim().min(1, 'required').max(80),
  lastName: z.string().trim().min(1, 'required').max(80),
  gender: z.enum(GENDERS),
  hireDate: isoDateSchema,
  employmentType: z.enum(EMPLOYMENT_TYPES),
};

/**
 * Optional fields. On create a blank value means "not provided"; on update it means "clear"
 * (null), while an omitted key leaves the stored value unchanged.
 */
const optionalFields = <M extends 'create' | 'update'>(mode: M) => {
  type Wrapped<T extends z.ZodTypeAny> = M extends 'create' ? ReturnType<typeof emptyToUndefined<T>> : ReturnType<typeof emptyToNull<T>>;
  type Text = M extends 'create' ? ReturnType<typeof optionalText> : ReturnType<typeof clearableText>;
  const wrap = <T extends z.ZodTypeAny>(s: T) => (mode === 'create' ? emptyToUndefined(s) : emptyToNull(s)) as Wrapped<T>;
  const text = (max: number) => (mode === 'create' ? optionalText(max) : clearableText(max)) as Text;
  return {
    nickname: text(40),
    dateOfBirth: wrap(isoDateSchema),
    phone: wrap(laoPhoneSchema),
    email: wrap(emailSchema),
    address: text(300),
    nationality: text(60),
    idCardNo: text(30),
    socialSecurityNo: wrap(socialSecurityNoSchema),
    familyBookNo: wrap(familyBookNoSchema),
    branchId: wrap(z.string()),
    departmentId: wrap(z.string()),
    positionId: wrap(z.string()),
    managerId: wrap(z.string()),
  };
};

const foreignNeedsNationality = <T extends { nationalityType?: string; nationality?: string | null }>(v: T) =>
  v.nationalityType !== 'FOREIGN' || !!v.nationality;
const nationalityRequired = { message: 'nationality_required', path: ['nationality'] };

/** Login methods HR can issue. PASSWORD does not need an email: staff sign in with employee code or phone. */
export const credentialMethodSchema = z.enum(['PASSWORD', 'PIN']);
export const issueCredentialSchema = z.object({
  method: credentialMethodSchema,
  roleCode: z.enum(['HR_ADMIN', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
});
export type IssueCredentialInput = z.input<typeof issueCredentialSchema>;

export const createEmployeeSchema = z
  .object({
    ...requiredFields,
    ...optionalFields('create'),
    nationalityType: z.enum(NATIONALITY_TYPES).default(NationalityType.LAO),
    status: z.enum(EMPLOYMENT_STATUSES).default('PROBATION'),
    hazardousWork: z.boolean().default(false),
    /** Optionally create a login. PIN login works for staff without email/smartphone. */
    login: issueCredentialSchema.optional(),
  })
  .refine(foreignNeedsNationality, nationalityRequired);
export type CreateEmployeeInput = z.input<typeof createEmployeeSchema>;
export type CreateEmployeeData = z.output<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z
  .object(requiredFields)
  .partial()
  .extend({
    ...optionalFields('update'),
    nationalityType: z.enum(NATIONALITY_TYPES).optional(),
    status: z.enum(EMPLOYMENT_STATUSES).optional(),
    hazardousWork: z.boolean().optional(),
    /** Effective date for the employment-history entry (FR-EMP-08.4); defaults to today in the workspace timezone. */
    effectiveDate: isoDateSchema.optional(),
  })
  .refine(foreignNeedsNationality, nationalityRequired);
export type UpdateEmployeeInput = z.input<typeof updateEmployeeSchema>;
export type UpdateEmployeeData = z.output<typeof updateEmployeeSchema>;

export const employeeListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(EMPLOYMENT_STATUSES).optional(),
  departmentId: z.string().optional(),
  branchId: z.string().optional(),
  nationalityType: z.enum(NATIONALITY_TYPES).optional(),
});
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

const refSchema = z.object({ id: z.string(), name: z.string() }).nullable();

export const employeeSummarySchema = z.object({
  id: z.string(),
  employeeCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  nickname: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  status: z.enum(EMPLOYMENT_STATUSES),
  nationalityType: z.enum(NATIONALITY_TYPES),
  department: refSchema,
  position: refSchema,
  branch: refSchema,
  hasLogin: z.boolean(),
});
export type EmployeeSummary = z.infer<typeof employeeSummarySchema>;

export const employeeDocumentSchema = z.object({
  id: z.string(),
  type: z.enum(DOCUMENT_TYPES),
  number: z.string().nullable(),
  issuedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  note: z.string().nullable(),
  /** Computed by the API with the workspace alert thresholds and timezone; clients render it as-is. */
  expiryStatus: z.enum(EXPIRY_STATES),
  daysUntilExpiry: z.number().int().nullable(),
  expiryThresholdDays: z.number().int().nullable(),
  /** Uploaded scan (FR-EMP-07); download via GET /employees/:id/documents/:documentId/file. */
  file: storedFileSchema.nullable(),
});
export type EmployeeDocument =z.infer<typeof employeeDocumentSchema>;

export const emergencyContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  relationship: z.string(),
  phone: z.string(),
});
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

export const employeeDetailSchema = employeeSummarySchema.extend({
  gender: z.enum(GENDERS),
  dateOfBirth: z.string().nullable(),
  address: z.string().nullable(),
  nationality: z.string().nullable(),
  idCardNo: z.string().nullable(),
  /** Masked unless caller has employee.sensitive.read. */
  socialSecurityNo: z.string().nullable(),
  familyBookNo: z.string().nullable(),
  sensitiveMasked: z.boolean(),
  hireDate: z.string(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  hazardousWork: z.boolean(),
  manager: refSchema,
  documents: z.array(employeeDocumentSchema),
  emergencyContacts: z.array(emergencyContactSchema),
});
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

export const createDocumentSchema = z
  .object({
    type: z.enum(DOCUMENT_TYPES),
    number: optionalText(60),
    issuedAt: optionalDate,
    expiresAt: optionalDate,
    note: optionalText(300),
  })
  .refine((v) => !v.issuedAt || !v.expiresAt || v.issuedAt <= v.expiresAt, {
    message: 'expiry_before_issue',
    path: ['expiresAt'],
  });
export type CreateDocumentInput = z.input<typeof createDocumentSchema>;
export type CreateDocumentData = z.output<typeof createDocumentSchema>;

export const createEmergencyContactSchema = z.object({
  name: z.string().trim().min(1, 'required').max(80),
  relationship: z.string().trim().min(1, 'required').max(40),
  phone: laoPhoneSchema,
});
export type CreateEmergencyContactInput = z.input<typeof createEmergencyContactSchema>;
export type CreateEmergencyContactData = z.output<typeof createEmergencyContactSchema>;

/** Returned once when HR creates a login or resets a PIN — never stored in clear. */
export const credentialIssuedSchema = z.object({
  userId: z.string(),
  method: credentialMethodSchema,
  temporarySecret: z.string(),
});
export type CredentialIssued = z.infer<typeof credentialIssuedSchema>;

export const createEmployeeResponseSchema = z.object({
  employee: employeeDetailSchema,
  credential: credentialIssuedSchema.nullable(),
});
export type CreateEmployeeResponse = z.infer<typeof createEmployeeResponseSchema>;

export const employmentHistoryQuerySchema = paginationQuerySchema.omit({ search: true });
export type EmploymentHistoryQuery = z.infer<typeof employmentHistoryQuerySchema>;

/** One employment-history entry (FR-EMP-08). `fromValue`/`toValue` hold the changed fields only. */
export const employmentHistoryEntrySchema = z.object({
  id: z.string(),
  changeType: z.string(),
  fromValue: z.record(z.unknown()).nullable(),
  toValue: z.record(z.unknown()).nullable(),
  effectiveDate: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type EmploymentHistoryEntry = z.infer<typeof employmentHistoryEntrySchema>;
