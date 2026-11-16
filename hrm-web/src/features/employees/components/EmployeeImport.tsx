'use client';
import {
  ApiError,
  DEFAULT_FILE_MAX_BYTES,
  EMPLOYEE_IMPORT_ACCEPT,
  EMPLOYEE_IMPORT_FORMATS,
  interpolate,
  type EmployeeImportError,
} from '@hrm/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, ConfirmDialog, FileUpload, Icon } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useEmployeeImport } from '../hooks';
import { ImportPreview } from './ImportPreview';

/** Rows rejected by confirm when the data changed after the preview (`import_invalid`). */
const confirmErrors = (err: unknown): EmployeeImportError[] | null =>
  err instanceof ApiError && err.code === 'import_invalid' ? ((err.details as { errors?: EmployeeImportError[] } | undefined)?.errors ?? []) : null;

/** Bulk import flow (FR-EMP-09): template → upload → preview with error rows → confirm → result. */
export function EmployeeImport() {
  const t = useT();
  const { preview, confirm, template } = useEmployeeImport();
  const [file, setFile] = useState<File | null>(null);
  const [asking, setAsking] = useState(false);

  const upload = async (f: File) => {
    confirm.reset();
    setFile(f);
    await preview.mutateAsync(f);
  };
  const restart = () => {
    setFile(null);
    preview.reset();
    confirm.reset();
  };
  const submit = () => {
    if (!file || !preview.data?.importToken) return;
    confirm.mutate({ file, importToken: preview.data.importToken }, { onSettled: () => setAsking(false) });
  };

  if (confirm.data) {
    return (
      <Card>
        <div role="status" className="flex flex-col items-start gap-3" data-testid="import-done">
          <p className="flex items-center gap-2 text-base font-semibold text-ink dark:text-night-ink">
            <Icon name="check_circle" className="text-primary" />
            {interpolate(t('empx.import.done'), { count: confirm.data.created })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/employees">
              <Button>{t('empx.import.backToList')}</Button>
            </Link>
            <Button variant="secondary" onClick={restart}>
              {t('empx.import.another')}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const data = preview.data;
  const staleErrors = confirmErrors(confirm.error);
  const shown = data && staleErrors ? { ...data, errors: staleErrors } : data;
  const count = data?.rows ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card title={t('empx.import.step.template')}>
        <div className="flex flex-wrap gap-2">
          {EMPLOYEE_IMPORT_FORMATS.map((format) => (
            <Button
              key={format}
              variant="secondary"
              icon="download"
              loading={template.isPending && template.variables === format}
              onClick={() => template.mutate(format)}
              data-testid={`import-template-${format}`}
            >
              {t(format === 'xlsx' ? 'empx.import.templateXlsx' : 'empx.import.templateCsv')}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">{t('empx.import.templateHint')}</p>
        {template.error ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {t((template.error as { code?: string }).code ?? 'unknown')}
          </p>
        ) : null}
      </Card>

      <Card title={t('empx.import.step.upload')}>
        <FileUpload
          accept={EMPLOYEE_IMPORT_ACCEPT}
          maxBytes={DEFAULT_FILE_MAX_BYTES}
          label={t('empx.import.choose')}
          hint={file ? file.name : t('empx.import.fileHint')}
          onUpload={upload}
          disabled={confirm.isPending}
          data-testid="import-file"
        />
      </Card>

      {shown && (
        <Card
          title={t('empx.import.step.review')}
          actions={
            data?.importToken && !staleErrors ? (
              <Button icon="group_add" onClick={() => setAsking(true)} data-testid="import-confirm">
                {interpolate(t('empx.import.confirm'), { count })}
              </Button>
            ) : null
          }
        >
          <ImportPreview preview={shown} />
          {confirm.error && !staleErrors ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {t((confirm.error as { code?: string }).code ?? 'unknown')}
            </p>
          ) : null}
        </Card>
      )}

      <ConfirmDialog
        open={asking}
        title={t('empx.import.title')}
        message={interpolate(t('empx.import.confirmMessage'), { count })}
        confirmLabel={interpolate(t('empx.import.confirm'), { count })}
        loading={confirm.isPending}
        onConfirm={submit}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
