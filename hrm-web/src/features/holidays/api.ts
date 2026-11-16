import type { CreateHolidayInput, EnsureHolidayYearResult, Holiday, UpdateHolidayInput } from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

export const holidaysApi = {
  list: (year: number) => apiFetch<Holiday[]>('/holidays', { query: { year } }),
  create: (body: CreateHolidayInput) => apiFetch<Holiday>('/holidays', { method: 'POST', body }),
  update: (id: string, body: UpdateHolidayInput) => apiFetch<Holiday>(`/holidays/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => apiFetch<void>(`/holidays/${id}`, { method: 'DELETE' }),
  ensureYear: (year: number) => apiFetch<EnsureHolidayYearResult>('/holidays/ensure-year', { method: 'POST', body: { year } }),
};
