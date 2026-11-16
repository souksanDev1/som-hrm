'use client';
import { createDocumentSchema, DOCUMENT_TYPES, type CreateDocumentInput, type EmployeeDocument } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Card, ConfirmDialog, Field, Input, Modal, Select, StateView } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { useEmployeeDocuments } from '../hooks';
import { ExpiryBadge } from './ExpiryBadge';
import { DocumentFileControls } from '@/features/files/DocumentFileControls';

export interface DocumentsCardProps {
  employeeId: string;
  documents: readonly EmployeeDocument[];
  canEdit: boolean;
}

export function DocumentsCard({ employeeId, documents, canEdit }: DocumentsCardProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { add, remove } = useEmployeeDocuments(employeeId);
  const form = useForm<CreateDocumentInput>({ resolver: zodResolver(createDocumentSchema), defaultValues: { type: 'WORK_PERMIT' } });
  const err = (m?: string) => (m ? t(m) : undefined);

  const submit = form.handleSubmit(async (values) => {
    await add.mutateAsync(values);
    form.reset({ type: 'WORK_PERMIT' });
    setOpen(false);
  });

  return (
    <Card
      title={t('employee.documents')}
      actions={canEdit && <Button size="sm" variant="secondary" icon="add" onClick={() => setOpen(true)} data-testid="add-document">{t('common.add')}</Button>}
    >
      {documents.length === 0 ? (
        <StateView kind="empty" title={t('common.empty')} />
      ) : (
        <ul className="flex flex-col divide-y divide-line dark:divide-night-line">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-3" data-testid="document-row">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink dark:text-night-ink">{t(`document.${d.type}`)}</p>
                <p className="text-xs tabular-nums text-ink-muted">
                  {d.number ?? '—'} · {d.issuedAt ?? '—'} → {d.expiresAt ?? '—'}
                </p>
              </div>
              <ExpiryBadge expiryStatus={d.expiryStatus} expiryThresholdDays={d.expiryThresholdDays} />
              <DocumentFileControls employeeId={employeeId} document={d} canEdit={canEdit} />
              {canEdit && (
                <Button size="sm" variant="ghost" icon="delete" aria-label={t('common.delete')} data-testid="delete-document" onClick={() => setPendingDelete(d.id)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {remove.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">{t(remove.error instanceof ApiError ? remove.error.code : 'unknown')}</p>
      ) : null}

      <ConfirmDialog
        open={!!pendingDelete}
        title={t('empx.document.confirmTitle')}
        message={t('empx.document.confirmRemove')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete, { onSettled: () => setPendingDelete(null) })}
      />

      <Modal
        open={open}
        title={t('employee.documents')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => void submit()} loading={add.isPending} data-testid="save-document">{t('common.save')}</Button>
          </>
        }
      >
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => void submit(e)} noValidate>
          <Field label={t('document.type')} htmlFor="doc-type" className="sm:col-span-2">
            <Select id="doc-type" options={DOCUMENT_TYPES.map((v) => ({ value: v, label: t(`document.${v}`) }))} {...form.register('type')} />
          </Field>
          <Field label={t('document.number')} htmlFor="doc-number" className="sm:col-span-2">
            <Input id="doc-number" {...form.register('number')} />
          </Field>
          <Field label={t('document.issuedAt')} htmlFor="doc-issued" error={err(form.formState.errors.issuedAt?.message)}>
            <Input id="doc-issued" type="date" {...form.register('issuedAt')} />
          </Field>
          <Field label={t('document.expiresAt')} htmlFor="doc-expires" error={err(form.formState.errors.expiresAt?.message)}>
            <Input id="doc-expires" type="date" {...form.register('expiresAt')} />
          </Field>
        </form>
      </Modal>
    </Card>
  );
}
