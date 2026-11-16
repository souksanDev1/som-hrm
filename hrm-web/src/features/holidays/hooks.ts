'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { holidaysApi } from './api';

export const holidayKeys = {
  all: ['holidays'] as const,
  year: (year: number) => ['holidays', year] as const,
};

export const useHolidays = (year: number) => useQuery({ queryKey: holidayKeys.year(year), queryFn: () => holidaysApi.list(year) });

/** Any holiday mutation; refreshes every loaded year. */
export const useHolidayMutation = <TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: holidayKeys.all }) });
};
