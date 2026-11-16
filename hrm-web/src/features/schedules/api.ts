import type {
  ApplyScheduleOverrideInput,
  EmployeeWorkSchedule,
  RevertScheduleOverrideInput,
  ScheduleBulkResult,
  ScheduleOverrideList,
  SetStandardScheduleInput,
  StandardScheduleView,
} from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

/** Working schedules (FR-WS-03). */
export const schedulesApi = {
  standard: () => apiFetch<StandardScheduleView>('/settings/work-schedule'),
  setStandard: (body: SetStandardScheduleInput) => apiFetch<StandardScheduleView>('/settings/work-schedule', { method: 'POST', body }),
  overrides: () => apiFetch<ScheduleOverrideList>('/settings/work-schedule/overrides'),
  applyOverride: (body: ApplyScheduleOverrideInput) =>
    apiFetch<ScheduleBulkResult>('/settings/work-schedule/overrides', { method: 'POST', body }),
  revertOverride: (body: RevertScheduleOverrideInput) =>
    apiFetch<ScheduleBulkResult>('/settings/work-schedule/overrides/revert', { method: 'POST', body }),
  forEmployee: (employeeId: string) => apiFetch<EmployeeWorkSchedule>(`/employees/${employeeId}/work-schedule`),
};
