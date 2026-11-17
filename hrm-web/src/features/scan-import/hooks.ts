'use client';
import type { ScanTemplateFormat } from '@hrm/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scanImportApi, type ScanUpload } from './api';

export const scanImportKeys = { all: ['scan-imports'] as const, list: (page: number) => ['scan-imports', 'list', page] as const };

export const useScanImportHistory = (page: number, pageSize = 10) =>
  useQuery({ queryKey: scanImportKeys.list(page), queryFn: () => scanImportApi.list({ page, pageSize }), placeholderData: keepPreviousData });

/** Scanner import (FR-ATT-02): preview saves nothing; confirm stores the OK rows as punches in one transaction. */
export const useScanImport = () => {
  const qc = useQueryClient();
  return {
    preview: useMutation({ mutationFn: (upload: ScanUpload) => scanImportApi.preview(upload) }),
    confirm: useMutation({
      mutationFn: ({ upload, importToken }: { upload: ScanUpload; importToken: string }) => scanImportApi.confirm(upload, importToken),
      onSuccess: () => qc.invalidateQueries({ queryKey: scanImportKeys.all }),
    }),
    template: useMutation({ mutationFn: (format: ScanTemplateFormat) => scanImportApi.downloadTemplate(format) }),
  };
};
