import type {
  AttendanceDayList,
  AttendanceStatus,
  AttendanceSummary,
  ClearRosterInput,
  CreateShiftInput,
  RosterView,
  RosterWriteResult,
  SetRosterInput,
  Shift,
  ShiftDeleteResult,
  UpdateShiftInput,
} from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

export interface AttendanceDaysParams {
  from: string;
  to: string;
  employeeId?: string;
  status?: AttendanceStatus;
  departmentId?: string;
}

/** Shifts, roster and attendance-day reads (FR-ATT-17/18). */
export const shiftsApi = {
  list: (activeOnly = false) => apiFetch<Shift[]>('/shifts', { query: activeOnly ? { active: 'true' } : {} }),
  create: (body: CreateShiftInput) => apiFetch<Shift>('/shifts', { method: 'POST', body }),
  update: (id: string, body: UpdateShiftInput) => apiFetch<Shift>(`/shifts/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => apiFetch<ShiftDeleteResult>(`/shifts/${id}`, { method: 'DELETE' }),

  roster: (q: { from: string; to: string; departmentId?: string }) => apiFetch<RosterView>('/roster', { query: { ...q } }),
  setRoster: (body: SetRosterInput) => apiFetch<RosterWriteResult>('/roster', { method: 'PUT', body }),
  clearRoster: (body: ClearRosterInput) => apiFetch<RosterWriteResult>('/roster', { method: 'DELETE', body }),

  /** One roster choice for many cells: a shift id, `REST` (rostered day off) or `SCHEDULE` (clear → work schedule). */
  applyRoster: ({ cells, choice }: { cells: { employeeId: string; date: string }[]; choice: string }): Promise<RosterWriteResult> =>
    choice === 'SCHEDULE'
      ? shiftsApi.clearRoster({ cells })
      : shiftsApi.setRoster({ cells: cells.map((c) => ({ ...c, shiftId: choice === 'REST' ? null : choice })) }),

  days: (q: AttendanceDaysParams) => apiFetch<AttendanceDayList>('/attendance/days', { query: { ...q } }),
  summary: (q: { month: string; employeeId?: string }) => apiFetch<AttendanceSummary>('/attendance/days/summary', { query: { ...q } }),
};
