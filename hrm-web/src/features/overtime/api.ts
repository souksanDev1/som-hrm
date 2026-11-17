import type { MyOvertime, OvertimeInput, OvertimePreview, OvertimePreviewInput, OvertimeReport, OvertimeRequestView } from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

export const overtimeApi = {
  preview: (body: OvertimePreviewInput) => apiFetch<OvertimePreview>('/overtime/preview', { method: 'POST', body }),
  create: (body: OvertimeInput) => apiFetch<OvertimeRequestView>('/overtime', { method: 'POST', body }),
  mine: (month: string) => apiFetch<MyOvertime>('/overtime/me', { query: { month } }),
  report: (month: string, employeeId?: string) => apiFetch<OvertimeReport>('/overtime', { query: { month, employeeId } }),
};
