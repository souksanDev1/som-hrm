import { z } from 'zod';
import { SCAN_FORMATS } from '../domain/scan-formats';
import { PunchKind, ScanRowStatus } from '../enums';
import { paginatedSchema, paginationQuerySchema } from './common';

/**
 * Scanner-file import (FR-ATT-02): upload → preview (nothing saved) → confirm with the preview token and the
 * same file → punches with source SCANNER. Multipart fields are validated with `scanImportFieldsSchema`.
 */
export const SCAN_ROW_STATUSES = [ScanRowStatus.OK, ScanRowStatus.UNMATCHED, ScanRowStatus.DUPLICATE, ScanRowStatus.INVALID] as const;

export const SCAN_TEMPLATE_FORMATS = ['csv', 'xlsx'] as const;
export type ScanTemplateFormat = (typeof SCAN_TEMPLATE_FORMATS)[number];
export const scanTemplateQuerySchema = z.object({ format: z.enum(SCAN_TEMPLATE_FORMATS).default('xlsx') });

/** Text fields sent with the file (multipart). `branchId` limits the import to one branch's employees. */
export const scanImportFieldsSchema = z.object({
  format: z.enum(SCAN_FORMATS),
  branchId: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional()),
  importToken: z.string().optional(),
});
export type ScanImportFields = z.infer<typeof scanImportFieldsSchema>;

export const scanImportPreviewRowSchema = z.object({
  rowNumber: z.number().int(),
  employeeCode: z.string().nullable(),
  employeeId: z.string().nullable(),
  employeeName: z.string().nullable(),
  /** Local wall-clock time from the file, `YYYY-MM-DD HH:mm:ss`. */
  localDateTime: z.string().nullable(),
  /** Work date the punch belongs to (a night shift's early-morning scans go to its start day). */
  workDate: z.string().nullable(),
  kind: z.nativeEnum(PunchKind).nullable(),
  /** True when the file gave no IN/OUT and the kind follows the order of the day's punches. */
  kindInferred: z.boolean(),
  status: z.enum(SCAN_ROW_STATUSES),
  /** Translatable reason for UNMATCHED / DUPLICATE / INVALID. */
  error: z.string().nullable(),
  /** For a DUPLICATE of an earlier row in the same file. */
  duplicateOfRow: z.number().int().nullable(),
});
export type ScanImportPreviewRow = z.infer<typeof scanImportPreviewRowSchema>;

export const scanImportCountsSchema = z.object({ OK: z.number().int(), UNMATCHED: z.number().int(), DUPLICATE: z.number().int(), INVALID: z.number().int() });
export type ScanImportCounts = z.infer<typeof scanImportCountsSchema>;

export const scanImportPreviewSchema = z.object({
  format: z.enum(SCAN_FORMATS),
  branchId: z.string().nullable(),
  totalRows: z.number().int(),
  counts: scanImportCountsSchema,
  rows: z.array(scanImportPreviewRowSchema),
  /** Present when at least one row can be imported: send it back with the same file to confirm. */
  importToken: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type ScanImportPreview = z.infer<typeof scanImportPreviewSchema>;

export const scanImportSummarySchema = z.object({
  id: z.string(),
  fileName: z.string(),
  format: z.enum(SCAN_FORMATS),
  branchId: z.string().nullable(),
  branchName: z.string().nullable(),
  status: z.string(),
  totalRows: z.number().int(),
  importedRows: z.number().int(),
  errorRows: z.number().int(),
  uploadedByName: z.string().nullable(),
  createdAt: z.string(),
});
export type ScanImportSummary = z.infer<typeof scanImportSummarySchema>;

export const scanImportListQuerySchema = paginationQuerySchema.pick({ page: true, pageSize: true });
export type ScanImportListQuery = z.infer<typeof scanImportListQuerySchema>;
export const scanImportListSchema = paginatedSchema(scanImportSummarySchema);
