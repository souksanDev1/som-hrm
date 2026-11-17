import type { MyOvertime, OvertimeInput, OvertimePreview, OvertimePreviewInput, OvertimeRequestView } from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export const overtimeKeys = { all: ['overtime'] as const };

export const overtimeApi = {
  preview: (body: OvertimePreviewInput) => apiFetch<OvertimePreview>('/overtime/preview', { method: 'POST', body }),
  create: (body: OvertimeInput) => apiFetch<OvertimeRequestView>('/overtime', { method: 'POST', body }),
  mine: (month: string) => apiFetch<MyOvertime>('/overtime/me', { query: { month } }),
};

/** Own OT requests of a month and approved hours by category (FR-ATT-23). */
export const useMyOvertime = (month: string) => useQuery({ queryKey: [...overtimeKeys.all, 'mine', month], queryFn: () => overtimeApi.mine(month) });

/** Live split + cap status for a complete period (`null` = not complete yet). */
export const useOvertimePreview = (input: OvertimePreviewInput | null) =>
  useQuery({
    queryKey: [...overtimeKeys.all, 'preview', input],
    queryFn: () => overtimeApi.preview(input!),
    enabled: !!input,
    retry: false,
    staleTime: 0,
  });

export const useCreateOvertime = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: overtimeApi.create, onSuccess: () => qc.invalidateQueries({ queryKey: overtimeKeys.all }) });
};

/** Device-local today "YYYY-MM-DD". */
export const localToday = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "YYYY-MM" moved by `delta` months. */
export const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
