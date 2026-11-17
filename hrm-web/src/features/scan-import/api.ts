import type { Paginated, ScanFormat, ScanImportListQuery, ScanImportPreview, ScanImportSummary, ScanTemplateFormat } from '@hrm/shared';
import { authorizedFetch, saveResponseAsFile } from '@/features/files/api';
import { apiFetch } from '@/lib/api-client';

/** What the user chose for one upload: the file, its scanner format and an optional branch. */
export interface ScanUpload {
  file: File;
  format: ScanFormat;
  branchId?: string;
}

/** Multipart body (FR-ATT-02): format + branch (+ the preview token on confirm), then the file. */
const body = ({ file, format, branchId }: ScanUpload, importToken?: string) => {
  const form = new FormData();
  form.append('format', format);
  if (branchId) form.append('branchId', branchId);
  if (importToken) form.append('importToken', importToken);
  form.append('file', file);
  return form;
};

export const scanImportApi = {
  list: (q: ScanImportListQuery) => apiFetch<Paginated<ScanImportSummary>>(`/attendance/scan-imports?page=${q.page}&pageSize=${q.pageSize}`),
  downloadTemplate: async (format: ScanTemplateFormat) =>
    saveResponseAsFile(await authorizedFetch(`/attendance/scan-imports/template?format=${format}`), `scan-import-template.${format}`),
  preview: async (upload: ScanUpload): Promise<ScanImportPreview> =>
    (await authorizedFetch('/attendance/scan-imports/preview', { method: 'POST', body: body(upload) })).json(),
  confirm: async (upload: ScanUpload, importToken: string): Promise<ScanImportSummary> =>
    (await authorizedFetch('/attendance/scan-imports/confirm', { method: 'POST', body: body(upload, importToken) })).json(),
};
