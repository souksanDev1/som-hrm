import type {
  CreateDocumentInput,
  CreateEmergencyContactInput,
  CreateEmployeeInput,
  CreateEmployeeResponse,
  CredentialIssued,
  EmployeeDetail,
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
import { apiFetch } from '@/lib/api-client';

export type EmployeeFilters = Partial<EmployeeListQuery>;
export type ExpiringDocumentFilters = Partial<ExpiringDocumentsQuery>;

export const employeesApi = {
  list: (q: EmployeeFilters) => apiFetch<Paginated<EmployeeSummary>>('/employees', { query: q }),
  get: (id: string) => apiFetch<EmployeeDetail>(`/employees/${id}`),
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
  issueCredential: (id: string, method: 'PIN' | 'PASSWORD') =>
    apiFetch<CredentialIssued>(`/employees/${id}/credentials`, { method: 'POST', body: { method } }),
};
