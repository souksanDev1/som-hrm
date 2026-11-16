'use client';
import { createWorkspaceSchema, type PlatformWorkspace } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldPath } from 'react-hook-form';
import type { z } from 'zod';
import { Button, Field, Input, PasswordInput } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { useCreateWorkspace } from '../hooks';

type FormInput = z.input<typeof createWorkspaceSchema>;
type FormOutput = z.output<typeof createWorkspaceSchema>;

const FIELDS = ['code', 'name', 'timezone', 'seatLimit', 'owner.displayName', 'owner.email', 'owner.phone', 'owner.password'] as const;

export interface CreateWorkspaceFormProps {
  onCreated(workspace: PlatformWorkspace): void;
  onCancel?(): void;
}

/** New customer workspace + its first owner account (FR-WS-01.1). */
export function CreateWorkspaceForm({ onCreated, onCancel }: CreateWorkspaceFormProps) {
  const t = useT();
  const create = useCreateWorkspace();
  const { register, handleSubmit, formState, setError } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { code: '', name: '', timezone: 'Asia/Vientiane', seatLimit: '50', owner: { displayName: '', email: '', phone: '', password: '' } },
  });
  const e = formState.errors;
  const msg = (m?: string) => (m ? t(m) : undefined);
  const formError = formState.errors.root?.message;

  const onSubmit = handleSubmit(async (values) => {
    try {
      onCreated(await create.mutateAsync(values));
    } catch (err) {
      if (!(err instanceof ApiError)) return setError('root', { message: 'unknown' });
      if (err.code === 'workspace_code_taken') return setError('code', { message: err.code });
      const path = Array.isArray(err.details) ? (err.details as { path?: string }[])[0]?.path : undefined;
      const field = FIELDS.find((f) => f === path);
      if (field) return setError(field as FieldPath<FormInput>, { message: 'invalid_type' });
      setError('root', { message: err.code });
    }
  });

  return (
    <form onSubmit={(ev) => void onSubmit(ev)} noValidate className="flex flex-col gap-4" data-testid="create-workspace-form">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('platform.workspace.code')} htmlFor="ws-code" error={msg(e.code?.message)} required>
          <Input id="ws-code" autoCapitalize="none" invalid={!!e.code} {...register('code')} />
        </Field>
        <Field label={t('platform.workspace.name')} htmlFor="ws-name" error={msg(e.name?.message)} required>
          <Input id="ws-name" invalid={!!e.name} {...register('name')} />
        </Field>
        <Field label={t('platform.workspace.timezone')} htmlFor="ws-timezone" error={msg(e.timezone?.message)}>
          <Input id="ws-timezone" autoCapitalize="none" invalid={!!e.timezone} {...register('timezone')} />
        </Field>
        <Field label={t('platform.workspace.seatLimit')} htmlFor="ws-seatLimit" error={msg(e.seatLimit?.message)}>
          <Input id="ws-seatLimit" inputMode="numeric" invalid={!!e.seatLimit} {...register('seatLimit')} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-4 rounded-md border border-line p-3 dark:border-night-line">
        <legend className="px-1 text-sm font-semibold text-ink dark:text-night-ink">{t('platform.workspace.owner')}</legend>
        <Field label={t('platform.workspace.ownerName')} htmlFor="ws-owner-name" error={msg(e.owner?.displayName?.message)} required>
          <Input id="ws-owner-name" invalid={!!e.owner?.displayName} {...register('owner.displayName')} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t('platform.workspace.ownerEmail')}
            htmlFor="ws-owner-email"
            error={msg(e.owner?.email?.message ?? e.owner?.root?.message)}
            hint={t('platform.workspace.ownerContactHint')}
          >
            <Input id="ws-owner-email" type="email" autoCapitalize="none" invalid={!!e.owner?.email} {...register('owner.email')} />
          </Field>
          <Field label={t('platform.workspace.ownerPhone')} htmlFor="ws-owner-phone" error={msg(e.owner?.phone?.message)}>
            <Input id="ws-owner-phone" type="tel" inputMode="tel" invalid={!!e.owner?.phone} {...register('owner.phone')} />
          </Field>
        </div>
        <Field label={t('platform.workspace.ownerPassword')} htmlFor="ws-owner-password" error={msg(e.owner?.password?.message)} required>
          <PasswordInput id="ws-owner-password" autoComplete="new-password" invalid={!!e.owner?.password} {...register('owner.password')} />
        </Field>
      </fieldset>
      {formError && (
        <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(formError)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" loading={formState.isSubmitting}>
          {t('platform.workspace.create')}
        </Button>
      </div>
    </form>
  );
}
