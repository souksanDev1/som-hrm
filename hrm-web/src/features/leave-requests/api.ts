import type {
  LeaveBalance,
  LeaveCancelInput,
  LeavePreview,
  LeavePreviewInput,
  LeaveRequest,
  LeaveRequestInput,
  LeaveRequestListQuery,
  LeaveType,
  StoredFileRef,
} from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';
import { authorizedFetch, saveResponseAsFile } from '@/features/files/api';

export interface LeaveBalances {
  employeeId: string;
  year: number;
  balances: LeaveBalance[];
}

/** Leave filing (FR-LV-03/05/06/09/10): every number shown comes from these endpoints. */
export const leaveRequestsApi = {
  types: () => apiFetch<LeaveType[]>('/leave/types'),
  balances: (year?: number) => apiFetch<LeaveBalances>('/leave/balances', { query: { year } }),
  preview: (body: LeavePreviewInput) => apiFetch<LeavePreview>('/leave/requests/preview', { method: 'POST', body }),
  create: (body: LeaveRequestInput) => apiFetch<LeaveRequest>('/leave/requests', { method: 'POST', body }),
  list: (query: Partial<LeaveRequestListQuery> = {}) => apiFetch<LeaveRequest[]>('/leave/requests', { query: { ...query } }),
  get: (id: string) => apiFetch<LeaveRequest>(`/leave/requests/${id}`),
  attachCertificate: (id: string, fileId: string) => apiFetch<LeaveRequest>(`/leave/requests/${id}/certificate`, { method: 'PUT', body: { fileId } }),
  /** FR-LV-12 (built by the approval/cancel module). */
  cancel: (id: string, body: LeaveCancelInput) => apiFetch<unknown>(`/leave/requests/${id}/cancel`, { method: 'POST', body }),
  /** Stand-alone certificate upload (`POST /files?purpose=ATTACHMENT`); only the uploader may link it. */
  uploadCertificate: async (file: File): Promise<StoredFileRef> => {
    const body = new FormData();
    body.append('file', file);
    return (await (await authorizedFetch('/files?purpose=ATTACHMENT', { method: 'POST', body })).json()) as StoredFileRef;
  },
  downloadCertificate: async (fileId: string): Promise<void> => {
    await saveResponseAsFile(await authorizedFetch(`/files/${fileId}`), 'certificate');
  },
};
