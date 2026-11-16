import type { StoredFileRef } from '@hrm/shared';
import { useAuthStore } from '@/features/auth/store';
import { API_URL, ApiError, apiFetch } from '@/lib/api-client';

/**
 * Binary requests (multipart upload, file download) that the JSON api client cannot send.
 * On 401 the session is refreshed through the shared client (GET /auth/me) and the call retried once.
 */
export const authorizedFetch = async (path: string, init: RequestInit = {}, retried = false): Promise<Response> => {
  const token = useAuthStore.getState().accessToken;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  } catch {
    throw new ApiError(0, 'network', 'Network error');
  }
  if (res.status === 401 && !retried) {
    await apiFetch('/auth/me'); // refreshes the token pair, or throws when the session is gone
    return authorizedFetch(path, init, true);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string; details?: unknown } } | null;
    throw new ApiError(res.status, data?.error?.code ?? 'unknown', data?.error?.message ?? res.statusText, data?.error?.details);
  }
  return res;
};

const documentFilePath = (employeeId: string, documentId: string) => `/employees/${employeeId}/documents/${documentId}/file`;

/** File name from `Content-Disposition` (RFC 5987 `filename*` first). */
const dispositionName = (header: string | null): string | null => {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) return decodeURIComponent(star[1]!);
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? null;
};

/** Hand a downloaded response to the browser as a file save. */
export const saveResponseAsFile = async (res: Response, fallbackName: string): Promise<void> => {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dispositionName(res.headers.get('content-disposition')) ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const filesApi = {
  uploadDocumentFile: async (employeeId: string, documentId: string, file: File): Promise<StoredFileRef> => {
    const body = new FormData();
    body.append('file', file);
    const res = await authorizedFetch(documentFilePath(employeeId, documentId), { method: 'PUT', body });
    return (await res.json()) as StoredFileRef;
  },

  /** Download through the authorised API and hand the bytes to the browser as a file save. */
  downloadDocumentFile: async (employeeId: string, documentId: string, fallbackName: string): Promise<void> => {
    await saveResponseAsFile(await authorizedFetch(documentFilePath(employeeId, documentId)), fallbackName);
  },
};
