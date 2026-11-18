'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kiosksApi } from './api';

export const kioskKeys = { all: ['kiosks'] as const };

export const useKiosks = (includeRevoked = false) =>
  useQuery({ queryKey: [...kioskKeys.all, includeRevoked], queryFn: () => kiosksApi.list(includeRevoked) });

/** Enrol or revoke; the list is refreshed either way. */
export const useKioskMutation = <TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: kioskKeys.all }) });
};
