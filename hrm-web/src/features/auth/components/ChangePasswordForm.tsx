'use client';
import { changePasswordSchema, type ChangePasswordInput } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, Field, PasswordInput } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useChangePassword } from '../hooks';
import { ApiErrorText } from './ApiErrorText';

export interface ChangePasswordFormProps {
  onSuccess?(): void;
  submitLabel?: string;
}

/** Current + new password; used by the forced-change gate and the account page. */
export function ChangePasswordForm({ onSuccess, submitLabel }: ChangePasswordFormProps) {
  const t = useT();
  const change = useChangePassword();
  const { register, handleSubmit, formState, reset } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const err = (m?: string) => (m ? t(m) : undefined);
  const onSubmit = handleSubmit(async (v) => {
    await change.mutateAsync(v);
    reset();
    onSuccess?.();
  });

  return (
    <form onSubmit={(e) => void onSubmit(e).catch(() => undefined)} noValidate className="flex flex-col gap-4" data-testid="change-password-form">
      <Field label={t('authx.password.current')} htmlFor="currentPassword" error={err(formState.errors.currentPassword?.message)} required>
        <PasswordInput id="currentPassword" autoComplete="current-password" invalid={!!formState.errors.currentPassword} {...register('currentPassword')} />
      </Field>
      <Field label={t('authx.password.new')} htmlFor="newPassword" hint={t('authx.password.hint')} error={err(formState.errors.newPassword?.message)} required>
        <PasswordInput id="newPassword" autoComplete="new-password" invalid={!!formState.errors.newPassword} {...register('newPassword')} />
      </Field>
      <ApiErrorText error={change.error} testId="change-password-error" />
      {change.isSuccess && !onSuccess && (
        <p role="status" className="text-sm text-success">{t('authx.password.changed')}</p>
      )}
      <Button type="submit" loading={formState.isSubmitting}>{submitLabel ?? t('authx.password.change')}</Button>
    </form>
  );
}
