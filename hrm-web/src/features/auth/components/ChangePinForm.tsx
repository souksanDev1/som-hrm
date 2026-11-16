'use client';
import { changePinSchema, type ChangePinInput } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, Field, PasswordInput } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useChangePin } from '../hooks';
import { ApiErrorText } from './ApiErrorText';

export interface ChangePinFormProps {
  /** False for an initial PIN: the current-PIN field is hidden. */
  hasPin: boolean;
  onSuccess?(): void;
}

export function ChangePinForm({ hasPin, onSuccess }: ChangePinFormProps) {
  const t = useT();
  const change = useChangePin();
  const { register, handleSubmit, formState } = useForm<ChangePinInput>({
    resolver: zodResolver(changePinSchema),
    defaultValues: { currentPin: undefined, newPin: '' },
  });
  const err = (m?: string) => (m ? t(m) : undefined);
  const onSubmit = handleSubmit(async (v) => {
    await change.mutateAsync(hasPin ? v : { newPin: v.newPin });
    onSuccess?.();
  });

  return (
    <form onSubmit={(e) => void onSubmit(e).catch(() => undefined)} noValidate className="flex flex-col gap-4" data-testid="change-pin-form">
      {hasPin && (
        <Field label={t('auth.currentPin')} htmlFor="currentPin" error={err(formState.errors.currentPin?.message)} required>
          <PasswordInput id="currentPin" inputMode="numeric" maxLength={6} autoComplete="current-password" {...register('currentPin', { setValueAs: (v: string) => v || undefined })} />
        </Field>
      )}
      <Field label={t('auth.newPin')} htmlFor="newPin" error={err(formState.errors.newPin?.message)} required>
        <PasswordInput id="newPin" inputMode="numeric" maxLength={6} autoComplete="new-password" invalid={!!formState.errors.newPin} {...register('newPin')} />
      </Field>
      <ApiErrorText error={change.error} />
      <Button type="submit" loading={formState.isSubmitting}>{t(hasPin ? 'auth.changePin' : 'authx.pin.set')}</Button>
    </form>
  );
}
