import { z } from 'zod';
import {
  DOCUMENT_TYPES,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  NATIONALITY_TYPES,
  NationalityType,
} from '../enums';
import { emptyToUndefined, isoDateSchema, laoPhoneSchema, paginationQuerySchema } from './common';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const optionalDate = emptyToUndefined(isoDateSchema);

/** Lao social-security (ປະກັນສັງຄົມ) number — digits/letters, 6–20 chars. */
export const socialSecurityNoSchema = z.string().trim().regex(/^[A-Za-z0-9-]{6,20}$/, 'invalid_ssn');
/** Family-book (ສຳມະໂນຄົວ) number. */
export const familyBookNoSchema = z.string().trim().regex(/^[A-Za-z0-9/-]{3,30}$/, 'invalid_family_book');

const employeeBaseSchema = z.object({
  employeeCode: z.string().trim().regex(/^[A-Za-z0-9-]{1,20}$/, 'invalid_employee_code'),
  firstName: z.string().trim().min(1, 'required').max(80),
  lastName: z.string().trim().min(1, 'required').max(80),
  nickname: optionalText(40),
  gender: z.enum(GENDERS),
  dateOfBirth: optionalDate,
  phone: emptyToUndefined(laoPhoneSchema),
  email: emptyToUndefined(z.string().trim().toLowerCase().email('invalid_email')),
  address: optionalText(300),
  nationalityType: z.enum(NATIONALITY_TYPES).default(NationalityType.LAO),
  nationality: optionalText(60),
  idCardNo: optionalText(30),
  socialSecurityNo: emptyToUndefined(socialSecurityNoSchema),
  familyBookNo: emptyToUndefined(familyBookNoSchema),
  hireDate: isoDateSchema,
  employmentType: z.enum(EMPLOYMENT_TYPES),
  status: z.enum(EMPLOYMENT_STATUSES).default('PROBATION'),
  hazardousWork: z.boolean().default(false),
  branchId: emptyToUndefined(z.string()),
  departmentId: emptyToUndefined(z.string()),
  positionId: emptyToUndefined(z.string()),
  managerId: emptyToUndefined(z.string()),
});

const foreignNeedsNationality = <T extends { nationalityType?: string; nationality?: string }>(v: T) =>
  v.nationalityType !== 'FOREIGN' || !!v.nationality;

export const createEmployeeSchema = employeeBaseSchema
  .extend({
    /** Optionally create a login. PIN login works for staff without email/smartphone. */
    login: z
      .object({
        method: z.enum(['PASSWORD', 'PIN']),
        roleCode: z.enum(['HR_ADMIN', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
      })
      .optional(),
  })
  .refine(foreignNeedsNationality, { message: 'nationality_required', path: ['nationality'] })
  .refine((v) => v.login?.method !== 'PASSWORD' || !!v.email, { message: 'email_required_for_password', path: ['email'] });
export type CreateEmployeeInput = z.input<typeof createEmployeeSchema>;
export type CreateEmployeeData = z.output<typeof createEmployeeSchema>;

export const updateEmployeeSchema = employeeBaseSchema
  .partial()
  .refine(foreignNeedsNationality, { message: 'nationality_required', path: ['nationality'] });
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
});
export type EmployeeDocument = z.infer<typeof employeeDocumentSchema>;

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
  method: z.enum(['PASSWORD', 'PIN']),
  temporarySecret: z.string(),
});
export type CredentialIssued = z.infer<typeof credentialIssuedSchema>;

export const createEmployeeResponseSchema = z.object({
  employee: employeeDetailSchema,
  credential: credentialIssuedSchema.nullable(),
});
export type CreateEmployeeResponse = z.infer<typeof createEmployeeResponseSchema>;
