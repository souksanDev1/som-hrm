import type {
  Correction,
  CreateCorrectionInput,
  CreateOffsitePermissionInput,
  DeviceBinding,
  EmployeeDevices,
  OffsitePermission,
  OnBehalfPunchInput,
  Paginated,
  ReviewDecisionInput,
  ReviewPunch,
  StoredFileRef,
} from '@hrm/shared';
import { authorizedFetch } from '@/features/files/api';
import { apiFetch } from '@/lib/api-client';

/** HR attendance tools and employee attendance requests (FR-ATT-04/11/14/16/19). */
export const attendanceRequestsApi = {
  reviewQueue: (page: number) => apiFetch<Paginated<ReviewPunch>>('/attendance/review', { query: { page } }),
  decideReview: (id: string, body: ReviewDecisionInput) => apiFetch<ReviewPunch>(`/attendance/review/${id}`, { method: 'POST', body }),
  punchOnBehalf: (body: OnBehalfPunchInput) => apiFetch<ReviewPunch>('/attendance/punches/on-behalf', { method: 'POST', body }),
  offsite: (q: { page: number; employeeId?: string; includeInactive?: boolean }) =>
    apiFetch<Paginated<OffsitePermission>>('/attendance/offsite-permissions', {
      query: { page: q.page, employeeId: q.employeeId, includeInactive: q.includeInactive ? 'true' : undefined },
    }),
  createOffsite: (body: CreateOffsitePermissionInput) => apiFetch<OffsitePermission>('/attendance/offsite-permissions', { method: 'POST', body }),
  revokeOffsite: (id: string) => apiFetch<OffsitePermission>(`/attendance/offsite-permissions/${id}/revoke`, { method: 'POST' }),
  devices: (employeeId: string) => apiFetch<EmployeeDevices>('/attendance/devices', { query: { employeeId } }),
  resetDevice: (id: string) => apiFetch<DeviceBinding>(`/attendance/devices/${id}/reset`, { method: 'POST' }),
  myCorrections: () => apiFetch<Correction[]>('/attendance/corrections/me'),
  createCorrection: (body: CreateCorrectionInput) => apiFetch<Correction>('/attendance/corrections', { method: 'POST', body }),
  uploadAttachment: async (file: File): Promise<StoredFileRef> => {
    const body = new FormData();
    body.append('file', file);
    return (await (await authorizedFetch('/files?purpose=ATTACHMENT', { method: 'POST', body })).json()) as StoredFileRef;
  },
  /** Object URL of a stand-alone file (selfie) for an <img>; the caller revokes it. */
  fileObjectUrl: async (fileId: string): Promise<string> => URL.createObjectURL(await (await authorizedFetch(`/files/${fileId}`)).blob()),
};
