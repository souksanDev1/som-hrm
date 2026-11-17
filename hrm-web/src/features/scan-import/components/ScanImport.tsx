'use client';
import { AttendanceMode, DEFAULT_FILE_MAX_BYTES, interpolate, SCAN_FORMATS, SCAN_IMPORT_ACCEPT, SCAN_TEMPLATE_FORMATS, type ScanFormat } from '@hrm/shared';
import { useState } from 'react';
import { Button, Card, ConfirmDialog, Field, FileUpload, Icon, Select } from '@/components/ui';
import { useBranches } from '@/features/org/hooks';
import { useT } from '@/lib/i18n';
import type { ScanUpload } from '../api';
import { useScanImport } from '../hooks';
import { ScanPreviewTable } from './ScanPreviewTable';

const errorCode = (err: unknown) => (err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'unknown');

/** Scanner-file import (FR-ATT-02): format (+ branch) → upload → preview with status filters → confirm → result. */
export function ScanImport() {
  const t = useT();
  const { preview, confirm, template } = useScanImport();
  const branches = useBranches();
  const [format, setFormat] = useState<ScanFormat>('ZKTECO');
  const [branchId, setBranchId] = useState('');
  const [upload, setUpload] = useState<ScanUpload | null>(null);
  const [asking, setAsking] = useState(false);

  const scannerBranches = (branches.data ?? []).filter((b) => b.attendanceModes.includes(AttendanceMode.SCANNER));

  const run = async (file: File) => {
    confirm.reset();
    const next = { file, format, branchId: branchId || undefined };
    setUpload(next);
    await preview.mutateAsync(next);
  };
  const restart = () => {
    setUpload(null);
    preview.reset();
    confirm.reset();
  };
  const submit = () => {
    if (!upload || !preview.data?.importToken) return;
    confirm.mutate({ upload, importToken: preview.data.importToken }, { onSettled: () => setAsking(false) });
  };
  // Changing the format or branch invalidates the current preview (the token is bound to both).
  const choose = (apply: () => void) => {
    apply();
    restart();
  };

  if (confirm.data) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-3" data-testid="scan-import-done">
          <p className="flex items-center gap-2 text-base font-semibold text-ink dark:text-night-ink">
            <Icon name="check_circle" className="text-primary" />
            {interpolate(t('scan.done'), { count: confirm.data.importedRows, skipped: confirm.data.errorRows })}
          </p>
          <Button variant="secondary" onClick={restart} data-testid="scan-import-another">
            {t('scan.another')}
          </Button>
        </div>
      </Card>
    );
  }

  const data = preview.data;
  const okRows = data?.counts.OK ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card title={t('scan.step.source')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('scan.format')} htmlFor="scan-format" hint={t(`scan.formatHint.${format}`)}>
            <Select
              id="scan-format"
              value={format}
              options={SCAN_FORMATS.map((f) => ({ value: f, label: t(`scan.format.${f}`) }))}
              onChange={(e) => choose(() => setFormat(e.target.value as ScanFormat))}
              data-testid="scan-format"
            />
          </Field>
          <Field label={t('scan.branch')} htmlFor="scan-branch" hint={t('scan.branchHint')}>
            <Select
              id="scan-branch"
              value={branchId}
              placeholder={t('scan.allBranches')}
              options={scannerBranches.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(e) => choose(() => setBranchId(e.target.value))}
              data-testid="scan-branch"
            />
          </Field>
        </div>
        {format === 'GENERIC' && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {SCAN_TEMPLATE_FORMATS.map((f) => (
              <Button
                key={f}
                variant="secondary"
                size="sm"
                icon="download"
                loading={template.isPending && template.variables === f}
                onClick={() => template.mutate(f)}
                data-testid={`scan-template-${f}`}
              >
                {t(f === 'xlsx' ? 'scan.templateXlsx' : 'scan.templateCsv')}
              </Button>
            ))}
            {template.error ? (
              <p role="alert" className="text-xs text-danger">
                {t(errorCode(template.error))}
              </p>
            ) : null}
          </div>
        )}
      </Card>

      <Card title={t('scan.step.upload')}>
        <FileUpload
          accept={SCAN_IMPORT_ACCEPT}
          maxBytes={DEFAULT_FILE_MAX_BYTES}
          label={t('scan.choose')}
          hint={upload ? upload.file.name : t('scan.fileHint')}
          onUpload={run}
          disabled={confirm.isPending}
          data-testid="scan-file"
        />
      </Card>

      {data && (
        <Card
          title={t('scan.step.review')}
          actions={
            data.importToken ? (
              <Button icon="playlist_add_check" onClick={() => setAsking(true)} data-testid="scan-confirm">
                {interpolate(t('scan.confirm'), { count: okRows })}
              </Button>
            ) : null
          }
        >
          <p className="mb-3 text-sm text-ink-muted" data-testid="scan-summary">
            {data.importToken ? interpolate(t('scan.summary'), { total: data.totalRows, ok: okRows }) : t('scan.nothingToImport')}
          </p>
          <ScanPreviewTable preview={data} />
          {confirm.error ? (
            <p role="alert" className="mt-3 text-sm text-danger" data-testid="scan-confirm-error">
              {t(errorCode(confirm.error))}
            </p>
          ) : null}
        </Card>
      )}

      <ConfirmDialog
        open={asking}
        title={t('scan.title')}
        message={interpolate(t('scan.confirmMessage'), { count: okRows, skipped: (data?.totalRows ?? 0) - okRows })}
        confirmLabel={interpolate(t('scan.confirm'), { count: okRows })}
        loading={confirm.isPending}
        onConfirm={submit}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
