import type { LeaveBalance, LeaveCancelInput, LeavePreview, LeavePreviewInput, LeaveRequest, LeaveRequestInput, LeaveType, StoredFileRef } from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { ApiError, apiFetch } from '@/lib/api';
import { API_URL } from '@/lib/config';

export const leaveKeys = { all: ['leave'] as const };

export interface LeaveBalances {
  employeeId: string;
  year: number;
  balances: LeaveBalance[];
}

const postAttachment = (uri: string) => {
  const body = new FormData();
  // React Native's FormData takes a file descriptor object instead of a Blob.
  body.append('file', { uri, name: 'certificate.jpg', type: 'image/jpeg' } as unknown as Blob);
  const token = useAuthStore.getState().accessToken;
  return fetch(`${API_URL}/files?purpose=ATTACHMENT`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body });
};

/** Leave filing (FR-LV-03/05/06/09): every count, balance and rule comes from the API. */
export const leaveApi = {
  types: () => apiFetch<LeaveType[]>('/leave/types'),
  balances: () => apiFetch<LeaveBalances>('/leave/balances'),
  mine: () => apiFetch<LeaveRequest[]>('/leave/requests', { query: { scope: 'mine' } }),
  get: (id: string) => apiFetch<LeaveRequest>(`/leave/requests/${id}`),
  preview: (body: LeavePreviewInput) => apiFetch<LeavePreview>('/leave/requests/preview', { method: 'POST', body }),
  create: (body: LeaveRequestInput) => apiFetch<LeaveRequest>('/leave/requests', { method: 'POST', body }),
  attachCertificate: (id: string, fileId: string) => apiFetch<LeaveRequest>(`/leave/requests/${id}/certificate`, { method: 'PUT', body: { fileId } }),
  /** FR-LV-12 (endpoint of the approval/cancel module). */
  cancel: (id: string, body: LeaveCancelInput) => apiFetch<unknown>(`/leave/requests/${id}/cancel`, { method: 'POST', body }),

  /** Upload a photo of the certificate (multipart, `POST /files?purpose=ATTACHMENT`); returns the file id. */
  uploadCertificatePhoto: async (uri: string): Promise<string> => {
    let res: Response;
    try {
      res = await postAttachment(uri);
      if (res.status === 401) {
        // Let the shared client rotate the access token, then retry once.
        await apiFetch('/auth/me');
        res = await postAttachment(uri);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(0, 'network', 'Network error');
    }
    const data = (await res.json().catch(() => null)) as (StoredFileRef & { error?: { code: string; message: string } }) | null;
    if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'unknown', data?.error?.message ?? res.statusText);
    return data!.id;
  },
};

export const useLeaveTypes = () => useQuery({ queryKey: [...leaveKeys.all, 'types'], queryFn: leaveApi.types, staleTime: 5 * 60_000 });
export const useMyLeaveBalances = () => useQuery({ queryKey: [...leaveKeys.all, 'balances'], queryFn: leaveApi.balances });
export const useMyLeaveRequests = () => useQuery({ queryKey: [...leaveKeys.all, 'mine'], queryFn: leaveApi.mine });
export const useLeaveRequest = (id: string) => useQuery({ queryKey: [...leaveKeys.all, 'request', id], queryFn: () => leaveApi.get(id), enabled: !!id });

/** Live preview of a complete form (`null` = not complete yet). */
export const useLeavePreview = (input: LeavePreviewInput | null) =>
  useQuery({ queryKey: [...leaveKeys.all, 'preview', input], queryFn: () => leaveApi.preview(input!), enabled: !!input, retry: false, staleTime: 0 });

const useLeaveMutation = <TInput, TResult>(fn: (input: TInput) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: leaveKeys.all }) });
};

export const useCreateLeaveRequest = () => useLeaveMutation(leaveApi.create);
/** Photograph → upload → attach to the request (FR-LV-05.3). */
export const useAttachCertificatePhoto = (id: string) =>
  useLeaveMutation(async (uri: string) => leaveApi.attachCertificate(id, await leaveApi.uploadCertificatePhoto(uri)));
export const useCancelLeaveRequest = (id: string) => useLeaveMutation((body: LeaveCancelInput) => leaveApi.cancel(id, body));
