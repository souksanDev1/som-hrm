import type { CheckinStatus, MyPunch, PunchBatchInput, PunchBatchResponse, StoredFileRef } from '@hrm/shared';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { ApiError, apiFetch } from '@/lib/api';
import { API_URL } from '@/lib/config';

export const checkinKeys = {
  status: ['checkin', 'status'] as const,
  punches: (from: string, to: string) => ['checkin', 'punches', from, to] as const,
};

const postSelfie = (uri: string) => {
  const body = new FormData();
  // React Native's FormData takes a file descriptor object instead of a Blob.
  body.append('file', { uri, name: 'selfie.jpg', type: 'image/jpeg' } as unknown as Blob);
  const token = useAuthStore.getState().accessToken;
  return fetch(`${API_URL}/files?purpose=SELFIE`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body });
};

export const checkinApi = {
  status: () => apiFetch<CheckinStatus>('/attendance/me/status'),
  myPunches: (from: string, to: string) => apiFetch<MyPunch[]>('/attendance/punches/me', { query: { from, to } }),
  submit: (body: PunchBatchInput) => apiFetch<PunchBatchResponse>('/attendance/punches', { method: 'POST', body }),

  /** Upload a selfie taken at check-in (multipart, `POST /files?purpose=SELFIE`); returns the file id. */
  uploadSelfie: async (uri: string): Promise<string> => {
    let res: Response;
    try {
      res = await postSelfie(uri);
      if (res.status === 401) {
        // Let the shared client rotate the access token, then retry once.
        await apiFetch('/auth/me');
        res = await postSelfie(uri);
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

export const useCheckinStatus = (enabled = true) =>
  useQuery({ queryKey: checkinKeys.status, queryFn: checkinApi.status, enabled, staleTime: 30_000 });

export const useMyPunches = (from: string, to: string, enabled = true) =>
  useQuery({ queryKey: checkinKeys.punches(from, to), queryFn: () => checkinApi.myPunches(from, to), enabled, staleTime: 30_000 });
