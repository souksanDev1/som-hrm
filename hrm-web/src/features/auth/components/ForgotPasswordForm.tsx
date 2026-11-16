'use client';
import {
  forgotCredentialSchema,
  resetPasswordSchema,
  type ForgotCredentialInput,
  type ResetPasswordInput,
} from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, Field, Input, PasswordInput } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useForgotCredential, useResetPassword } from '../hooks';
import { useCountdown } from '../useCountdown';
import { ApiErrorText } from './ApiErrorText';

export interface ForgotPasswordFormProps {
  defaultWorkspaceCode?: string;
  onDone(): void;
}

/**
 * Self-service password reset (FR-AUTH-02): request an SMS code, then set a new password.
 * The confirmation is deliberately generic — the API never says whether the account exists.
 */
export function ForgotPasswordForm({ defaultWorkspaceCode = '', onDone }: ForgotPasswordFormProps) {
  const t = useT();
  const forgot = useForgotCredential();
  const reset = useResetPassword();
  const countdown = useCountdown();
  const request = useForm<ForgotCredentialInput>({
    resolver: zodResolver(forgotCredentialSchema),
    defaultValues: { workspaceCode: defaultWorkspaceCode, identifier: '' },
  });
  const resetForm = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { workspaceCode: '', identifier: '', code: '', newPassword: '' },
  });
  const err = (m?: string) => (m ? t(m) : undefined);

  const send = async (v: ForgotCredentialInput) => {
    const res = await forgot.mutateAsync(v);
    countdown.start(res.resendAfterSeconds);
    resetForm.setValue('workspaceCode', v.workspaceCode);
    resetForm.setValue('identifier', v.identifier);
  };
  const onRequest = request.handleSubmit(send);
  const onReset = resetForm.handleSubmit(async (v) => {
    await reset.mutateAsync(v);
    onDone();
  });

  if (!forgot.data) {
    return (
      <form onSubmit={(e) => void onRequest(e).catch(() => undefined)} noValidate className="flex flex-col gap-4" data-testid="forgot-form">
        <p className="text-sm text-ink-muted">{t('authx.forgot.intro')}</p>
        <Field label={t('auth.workspaceCode')} htmlFor="workspaceCode" error={err(request.formState.errors.workspaceCode?.message)} required>
          <Input id="workspaceCode" autoComplete="organization" autoCapitalize="none" invalid={!!request.formState.errors.workspaceCode} {...request.register('workspaceCode')} />
        </Field>
        <Field label={t('authx.login.identifier')} htmlFor="identifier" error={err(request.formState.errors.identifier?.message)} required>
          <Input id="identifier" autoComplete="username" autoCapitalize="none" invalid={!!request.formState.errors.identifier} {...request.register('identifier')} />
        </Field>
        <ApiErrorText error={forgot.error} />
        <Button type="submit" size="lg" fullWidth loading={request.formState.isSubmitting}>{t('authx.forgot.send')}</Button>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void onReset(e).catch(() => undefined)} noValidate className="flex flex-col gap-4" data-testid="reset-form">
      <p role="status" data-testid="forgot-sent" className="rounded-sm bg-primary-soft px-3 py-2 text-sm text-ink dark:text-night-ink">
        {t('authx.forgot.sent')}
      </p>
      <Field label={t('authx.forgot.code')} htmlFor="code" error={err(resetForm.formState.errors.code?.message)} required>
        <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} invalid={!!resetForm.formState.errors.code} {...resetForm.register('code')} />
      </Field>
      <Field label={t('authx.forgot.newPassword')} htmlFor="newPassword" hint={t('authx.password.hint')} error={err(resetForm.formState.errors.newPassword?.message)} required>
        <PasswordInput id="newPassword" autoComplete="new-password" invalid={!!resetForm.formState.errors.newPassword} {...resetForm.register('newPassword')} />
      </Field>
      <ApiErrorText error={reset.error} testId="reset-error" />
      <Button type="submit" size="lg" fullWidth loading={resetForm.formState.isSubmitting}>{t('authx.forgot.submit')}</Button>
      <Button
        type="button"
        variant="ghost"
        disabled={countdown.secondsLeft > 0}
        loading={forgot.isPending}
        onClick={() => void send(request.getValues()).catch(() => undefined)}
      >
        {countdown.secondsLeft > 0 ? t('authx.forgot.resendIn').replace('{seconds}', String(countdown.secondsLeft)) : t('authx.forgot.resend')}
      </Button>
    </form>
  );
}
