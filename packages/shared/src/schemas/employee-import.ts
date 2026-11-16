import { z } from 'zod';
import { CONTRACT_TYPES, EMPLOYMENT_STATUSES, GENDERS, NATIONALITY_TYPES, PAY_TYPES } from '../enums';
import { LAO_PROVINCE_CODES } from '../domain/lao-address';
import type { TranslationKey } from '../i18n';

/**
 * Bulk employee import (FR-EMP-09). Each row is mapped to a `createEmployeeSchema` input and goes
 * through the same create path as POST /employees; this file only describes the file layout.
 */
export interface EmployeeImportColumn {
  /** Stable column key, used in error reports. Equals the create-schema field except for references. */
  key: string;
  /** Header label (the template header is "Lao / English"). */
  labelKey: TranslationKey;
  required?: boolean;
  /**
   * - `date`: YYYY-MM-DD (xlsx date cells and Excel serial numbers are accepted too);
   * - `code`: one of `values`; `boolean`: yes/no;
   * - `ref`: branch/department/position by name or id, manager by employee code.
   */
  kind: 'text' | 'date' | 'code' | 'boolean' | 'ref';
  values?: readonly string[];
}

export const EMPLOYEE_IMPORT_COLUMNS = [
  { key: 'employeeCode', labelKey: 'employee.code', required: true, kind: 'text' },
  { key: 'firstName', labelKey: 'employee.firstName', required: true, kind: 'text' },
  { key: 'lastName', labelKey: 'employee.lastName', required: true, kind: 'text' },
  { key: 'firstNameEn', labelKey: 'empx.firstNameEn', kind: 'text' },
  { key: 'lastNameEn', labelKey: 'empx.lastNameEn', kind: 'text' },
  { key: 'nickname', labelKey: 'employee.nickname', kind: 'text' },
  { key: 'gender', labelKey: 'employee.gender', required: true, kind: 'code', values: GENDERS },
  { key: 'dateOfBirth', labelKey: 'employee.dateOfBirth', kind: 'date' },
  { key: 'phone', labelKey: 'employee.phone', kind: 'text' },
  { key: 'email', labelKey: 'employee.email', kind: 'text' },
  { key: 'address', labelKey: 'empx.address.detail', kind: 'text' },
  { key: 'village', labelKey: 'empx.address.village', kind: 'text' },
  { key: 'district', labelKey: 'empx.address.district', kind: 'text' },
  { key: 'province', labelKey: 'empx.address.province', kind: 'code', values: LAO_PROVINCE_CODES },
  { key: 'nationalityType', labelKey: 'employee.nationalityType', kind: 'code', values: NATIONALITY_TYPES },
  { key: 'nationality', labelKey: 'employee.nationality', kind: 'text' },
  { key: 'idCardNo', labelKey: 'employee.idCardNo', kind: 'text' },
  { key: 'socialSecurityNo', labelKey: 'employee.socialSecurityNo', kind: 'text' },
  { key: 'ssnRegisteredAt', labelKey: 'empx.ssnRegisteredAt', kind: 'date' },
  { key: 'familyBookNo', labelKey: 'employee.familyBookNo', kind: 'text' },
  { key: 'familyBookHolder', labelKey: 'empx.familyBookHolder', kind: 'text' },
  { key: 'hireDate', labelKey: 'employee.hireDate', required: true, kind: 'date' },
  { key: 'contractType', labelKey: 'empx.contractType', required: true, kind: 'code', values: CONTRACT_TYPES },
  { key: 'contractEndDate', labelKey: 'empx.contractEndDate', kind: 'date' },
  { key: 'probationEndDate', labelKey: 'empx.probationEndDate', kind: 'date' },
  { key: 'payType', labelKey: 'empx.payType', required: true, kind: 'code', values: PAY_TYPES },
  { key: 'status', labelKey: 'employee.status', kind: 'code', values: EMPLOYMENT_STATUSES },
  { key: 'hazardousWork', labelKey: 'employee.hazardousWork', kind: 'boolean' },
  { key: 'branch', labelKey: 'employee.branch', kind: 'ref' },
  { key: 'department', labelKey: 'employee.department', kind: 'ref' },
  { key: 'position', labelKey: 'employee.position', kind: 'ref' },
  { key: 'managerCode', labelKey: 'empx.import.col.managerCode', kind: 'ref' },
] as const satisfies readonly EmployeeImportColumn[];
export type EmployeeImportColumnKey = (typeof EMPLOYEE_IMPORT_COLUMNS)[number]['key'];

/** `accept` attribute for the import file picker. The API checks the content, not the extension. */
export const EMPLOYEE_IMPORT_ACCEPT = '.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const EMPLOYEE_IMPORT_FORMATS = ['xlsx', 'csv'] as const;
export type EmployeeImportFormat = (typeof EMPLOYEE_IMPORT_FORMATS)[number];

export const employeeImportTemplateQuerySchema = z.object({ format: z.enum(EMPLOYEE_IMPORT_FORMATS).default('xlsx') });

/**
 * One problem in the file. `row` is the spreadsheet row number (the header is row 1); `column` is a
 * column key, the raw header text for an unknown header, or null for row-level errors (e.g. seat limit).
 * `code` is a translatable error code.
 */
export const employeeImportErrorSchema = z.object({ row: z.number().int(), column: z.string().nullable(), code: z.string() });
export type EmployeeImportError = z.infer<typeof employeeImportErrorSchema>;

/** Non-sensitive columns shown in the preview table (identity numbers are never echoed back). */
export const EMPLOYEE_IMPORT_SAMPLE_COLUMNS = ['employeeCode', 'firstName', 'lastName', 'hireDate', 'branch', 'department', 'position'] as const;
export const employeeImportSampleRowSchema = z.object({
  row: z.number().int(),
  values: z.record(z.enum(EMPLOYEE_IMPORT_SAMPLE_COLUMNS), z.string()),
});
export type EmployeeImportSampleRow = z.infer<typeof employeeImportSampleRowSchema>;

export const employeeImportPreviewSchema = z.object({
  /** Data rows found in the file (blank rows are skipped). */
  rows: z.number().int(),
  errors: z.array(employeeImportErrorSchema),
  /** The first rows of the file, plus every row that has an error. */
  sample: z.array(employeeImportSampleRowSchema),
  /** Present only when there are no errors: send it back with the same file to confirm. */
  importToken: z.string().nullable(),
  /** When the token stops being accepted (ISO instant). */
  expiresAt: z.string().nullable(),
});
export type EmployeeImportPreview = z.infer<typeof employeeImportPreviewSchema>;

export const employeeImportResultSchema = z.object({ created: z.number().int() });
export type EmployeeImportResult = z.infer<typeof employeeImportResultSchema>;
