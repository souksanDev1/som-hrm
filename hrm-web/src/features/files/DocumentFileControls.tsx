'use client';
import { DEFAULT_FILE_MAX_BYTES, DOCUMENT_FILE_ACCEPT, type EmployeeDocument } from '@hrm/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, FileUpload } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { filesApi } from './api';

export interface DocumentFileControlsProps {
  employeeId: string;
  document: Pick<EmployeeDocument, 'id' | 'file'>;
  canEdit: boolean;
}

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Download link + upload/replace picker for one employee document (FR-EMP-07). */
export function DocumentFileControls({ employeeId, document: doc, canEdit }: DocumentFileControlsProps) {
  const t = useT();
  const qc = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: File) => filesApi.uploadDocumentFile(employeeId, doc.id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
  const download = useMutation({ mutationFn: (name: string) => filesApi.downloadDocumentFile(employeeId, doc.id, name) });

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="document-file">
      {doc.file ? (
        <Button
          size="sm"
          variant="ghost"
          icon="download"
          loading={download.isPending}
          onClick={() => download.mutate(doc.file!.originalName)}
          title={`${doc.file.originalName} · ${formatSize(doc.file.sizeBytes)}`}
          data-testid="document-download"
        >
          <span className="max-w-[10rem] truncate">{doc.file.originalName}</span>
        </Button>
      ) : (
        <span className="text-xs text-ink-muted">{t('file.none')}</span>
      )}
      {canEdit && (
        <FileUpload
          accept={DOCUMENT_FILE_ACCEPT}
          maxBytes={DEFAULT_FILE_MAX_BYTES}
          label={doc.file ? t('file.replace') : t('file.upload')}
          onUpload={(file) => upload.mutateAsync(file)}
          data-testid="document-upload"
        />
      )}
      {download.error ? <span role="alert" className="text-xs text-danger">{t((download.error as { code?: string }).code ?? 'unknown')}</span> : null}
    </div>
  );
}
