import type { CreateKioskInput, KioskDevice, KioskEnrolment } from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

/** Kiosk tablets of the workspace (FR-ATT-03.1, FR-WS-06.3). */
export const kiosksApi = {
  list: (includeRevoked = false) => apiFetch<KioskDevice[]>('/kiosks', { query: includeRevoked ? { includeRevoked: 'true' } : {} }),
  enrol: (body: CreateKioskInput) => apiFetch<KioskEnrolment>('/kiosks', { method: 'POST', body }),
  revoke: (id: string) => apiFetch<KioskDevice>(`/kiosks/${id}/revoke`, { method: 'POST' }),
};
