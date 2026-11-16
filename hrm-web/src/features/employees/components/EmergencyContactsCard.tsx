'use client';
import { createEmergencyContactSchema, type CreateEmergencyContactInput, type EmergencyContact } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Card, ConfirmDialog, Field, Input, Modal } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { useEmergencyContacts } from '../hooks';

export interface EmergencyContactsCardProps {
  employeeId: string;
  contacts: readonly EmergencyContact[];
  canEdit: boolean;
}

export function EmergencyContactsCard({ employeeId, contacts, canEdit }: EmergencyContactsCardProps) {
  const t = useT();
  const { add, update, remove } = useEmergencyContacts(employeeId);
  const [open, setOpen] = useState(false);
  /** The contact being edited (FR-EMP-01.5), or null when adding. */
  const [editing, setEditing] = useState<EmergencyContact | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const form = useForm<CreateEmergencyContactInput>({ resolver: zodResolver(createEmergencyContactSchema) });
  const err = (m?: string) => (m ? t(m) : undefined);
  const error = add.error ?? update.error ?? remove.error;
  const saving = add.isPending || update.isPending;

  const openFor = (contact: EmergencyContact | null) => {
    setEditing(contact);
    form.reset(contact ? { name: contact.name, relationship: contact.relationship, phone: contact.phone } : { name: '', relationship: '', phone: '' });
    setOpen(true);
  };

  const submit = form.handleSubmit(async (values) => {
    if (editing) await update.mutateAsync({ contactId: editing.id, body: values });
    else await add.mutateAsync(values);
    form.reset();
    setOpen(false);
  });

  return (
    <Card
      title={t('employee.emergencyContacts')}
      actions={
        canEdit && (
          <Button size="sm" variant="secondary" icon="add" onClick={() => openFor(null)} data-testid="add-contact">
            {t('common.add')}
          </Button>
        )
      }
    >
      {contacts.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('common.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm" data-testid="contact-row">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-ink dark:text-night-ink">{c.name}</span>{' '}
                <span className="text-ink-muted">({c.relationship})</span>
                <span className="block tabular-nums text-ink-muted">{c.phone}</span>
              </div>
              {canEdit && (
                <>
                  <Button size="sm" variant="ghost" icon="edit" aria-label={t('empx.contacts.edit')} data-testid="edit-contact" onClick={() => openFor(c)} />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="delete"
                    aria-label={t('empx.contacts.remove')}
                    data-testid="remove-contact"
                    onClick={() => setPendingDelete(c.id)}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {error ? <p role="alert" className="mt-2 text-sm text-danger">{t(error instanceof ApiError ? error.code : 'unknown')}</p> : null}

      <ConfirmDialog
        open={!!pendingDelete}
        title={t('empx.contacts.remove')}
        message={t('empx.contacts.confirmRemove')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete, { onSettled: () => setPendingDelete(null) })}
      />

      <Modal
        open={open}
        title={t(editing ? 'empx.contacts.edit' : 'empx.contacts.add')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => void submit().catch(() => undefined)} loading={saving} data-testid="save-contact">{t('common.save')}</Button>
          </>
        }
      >
        <form className="grid grid-cols-1 gap-4" onSubmit={(e) => void submit(e).catch(() => undefined)} noValidate>
          <Field label={t('empx.contacts.name')} htmlFor="contact-name" required error={err(form.formState.errors.name?.message)}>
            <Input id="contact-name" {...form.register('name')} />
          </Field>
          <Field label={t('empx.contacts.relationship')} htmlFor="contact-relationship" required error={err(form.formState.errors.relationship?.message)}>
            <Input id="contact-relationship" {...form.register('relationship')} />
          </Field>
          <Field label={t('empx.contacts.phone')} htmlFor="contact-phone" required error={err(form.formState.errors.phone?.message)}>
            <Input id="contact-phone" inputMode="tel" placeholder="020 XXXX XXXX" {...form.register('phone')} />
          </Field>
        </form>
      </Modal>
    </Card>
  );
}
