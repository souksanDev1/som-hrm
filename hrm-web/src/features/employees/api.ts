import type {
  CreateDocumentInput,
  CreateEmergencyContactInput,
  CreateEmployeeInput,
  CreateEmployeeResponse,
  CredentialIssued,
  EmployeeDetail,
  EmployeeImportFormat,
  EmployeeImportPreview,
  EmployeeImportResult,
  EmployeeListQuery,
  EmployeeSummary,
  EmploymentHistoryEntry,
  EmploymentHistoryQuery,
  ExpiringDocument,
  ExpiringDocumentsQuery,
  Paginated,
  UpdateEmergencyContactInput,
  UpdateEmployeeInput,
} from '@hrm/shared';
import { authorizedFetch, saveResponseAsFile } from '@/features/files/api';
import { apiFetch } from '@/lib/api-client';

export type EmployeeFilters = Partial<EmployeeListQuery>;
export type ExpiringDocumentFilters = Partial<ExpiringDocumentsQuery>;

/** Multipart body for the bulk import (FR-EMP-09): the file, plus the preview token on confirm. */
const importBody = (file: File, importToken?: string) => {
  const body = new FormData();
  if (importToken) body.append('importToken', importToken);
  body.append('file', file);
  return body;
};

export const employeesApi = {
  list: (q: EmployeeFilters) => apiFetch<Paginated<EmployeeSummary>>('/employees', { query: q }),
  get: (id: string) => apiFetch<EmployeeDetail>(`/employees/${id}`),
  myProfile: () => apiFetch<EmployeeDetail>('/me/profile'),
  history: (id: string, q: EmploymentHistoryQuery) =>
    apiFetch<Paginated<EmploymentHistoryEntry>>(`/employees/${id}/history`, { query: q }),
  create: (body: CreateEmployeeInput) => apiFetch<CreateEmployeeResponse>('/employees', { method: 'POST', body }),
  update: (id: string, body: UpdateEmployeeInput) => apiFetch<EmployeeDetail>(`/employees/${id}`, { method: 'PATCH', body }),
  addDocument: (id: string, body: CreateDocumentInput) => apiFetch<EmployeeDetail>(`/employees/${id}/documents`, { method: 'POST', body }),
  removeDocument: (id: string, documentId: string) =>
    apiFetch<EmployeeDetail>(`/employees/${id}/documents/${documentId}`, { method: 'DELETE' }),
  addContact: (id: string, body: CreateEmergencyContactInput) =>
    apiFetch<EmployeeDetail>(`/employees/${id}/emergency-contacts`, { method: 'POST', body }),
  updateContact: (id: string, contactId: string, body: UpdateEmergencyContactInput) =>
    apiFetch<EmployeeDetail>(`/employees/${id}/emergency-contacts/${contactId}`, { method: 'PATCH', body }),
  removeContact: (id: string, contactId: string) =>
    apiFetch<EmployeeDetail>(`/employees/${id}/emergency-contacts/${contactId}`, { method: 'DELETE' }),
  expiringDocuments: (q: ExpiringDocumentFilters) => apiFetch<Paginated<ExpiringDocument>>('/documents/expiring', { query: q }),
  downloadImportTemplate: async (format: EmployeeImportFormat) =>
    saveResponseAsFile(await authorizedFetch(`/employees/import/template?format=${format}`), `employee-import-template.${format}`),
  previewImport: async (file: File): Promise<EmployeeImportPreview> =>
    (await authorizedFetch('/employees/import/preview', { method: 'POST', body: importBody(file) })).json(),
  confirmImport: async (file: File, importToken: string): Promise<EmployeeImportResult> =>
    (await authorizedFetch('/employees/import/confirm', { method: 'POST', body: importBody(file, importToken) })).json(),
  issueCredential: (id: string, method: 'PIN' | 'PASSWORD') =>
    apiFetch<CredentialIssued>(`/employees/${id}/credentials`, { method: 'POST', body: { method } }),
};
