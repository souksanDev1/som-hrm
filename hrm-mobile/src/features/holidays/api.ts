import type { Holiday } from '@hrm/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

/** The signed-in employee's own holidays for `year` (women-only and nationality rules applied by the API). */
export const useMyHolidays = (year: number) =>
  useQuery({
    queryKey: ['holidays', 'mine', year],
    queryFn: () => apiFetch<Holiday[]>('/holidays/mine', { query: { year } }),
    staleTime: 60 * 60_000,
  });
