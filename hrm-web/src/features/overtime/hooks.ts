'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { overtimeApi } from './api';

export const overtimeKeys = {
  all: ['overtime'] as const,
  mine: (month: string) => ['overtime', 'mine', month] as const,
  report: (month: string, employeeId?: string) => ['overtime', 'report', month, employeeId ?? null] as const,
};

export const useMyOvertime = (month: string) => useQuery({ queryKey: overtimeKeys.mine(month), queryFn: () => overtimeApi.mine(month) });

export const useOvertimeReport = (month: string, employeeId?: string) =>
  useQuery({ queryKey: overtimeKeys.report(month, employeeId), queryFn: () => overtimeApi.report(month, employeeId) });

/** File an OT request; refreshes every loaded OT list. */
export const useCreateOvertime = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: overtimeApi.create, onSuccess: () => qc.invalidateQueries({ queryKey: overtimeKeys.all }) });
};

/** Current calendar month "YYYY-MM" and today "YYYY-MM-DD" in the browser's zone (the workspace's for Lao users). */
export const localToday = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
