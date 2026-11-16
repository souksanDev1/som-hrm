'use client';
import { verifyPhoneSchema, type VerifyPhoneInput } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, Field, Input } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useConfirmPhoneOtp, useRequestPhoneOtp } from '../hooks';
import { useCountdown } from '../useCountdown';
import { ApiErrorText } from './ApiErrorText';

/** First-login phone verification (FR-AUTH-02.1): request an SMS code, then confirm it. */
export function VerifyPhoneForm({ onSuccess }: { onSuccess?(): void }) {
  const t = useT();
  const request = useRequestPhoneOtp();
  const confirm = useConfirmPhoneOtp();
  const countdown = useCountdown();
  const { register, handleSubmit, formState } = useForm<VerifyPhoneInput>({
    resolver: zodResolver(verifyPhoneSchema),
    defaultValues: { code: '' },
  });
  const send = async () => {
    const res = await request.mutateAsync();
    countdown.start(res.resendAfterSeconds);
  };
  const onSubmit = handleSubmit(async (v) => {
    await confirm.mutateAsync(v);
    onSuccess?.();
  });
  const sentTo = request.data?.maskedPhone;

  return (
    <div className="flex flex-col gap-4" data-testid="verify-phone">
      <p className="text-sm text-ink-muted">{t('authx.setup.verifyPhoneIntro')}</p>
      {request.data ? (
        <form onSubmit={(e) => void onSubmit(e).catch(() => undefined)} noValidate className="flex flex-col gap-4">
          {sentTo && <p role="status" className="text-sm text-ink dark:text-night-ink">{t('authx.setup.codeSentTo').replace('{phone}', sentTo)}</p>}
          <Field label={t('authx.forgot.code')} htmlFor="code" error={formState.errors.code?.message ? t(formState.errors.code.message) : undefined} required>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} invalid={!!formState.errors.code} {...register('code')} />
          </Field>
          <ApiErrorText error={confirm.error} />
          <Button type="submit" loading={formState.isSubmitting}>{t('authx.setup.confirm')}</Button>
          <Button type="button" variant="ghost" disabled={countdown.secondsLeft > 0} loading={request.isPending} onClick={() => void send().catch(() => undefined)}>
            {countdown.secondsLeft > 0 ? t('authx.forgot.resendIn').replace('{seconds}', String(countdown.secondsLeft)) : t('authx.forgot.resend')}
          </Button>
        </form>
      ) : (
        <Button type="button" loading={request.isPending} onClick={() => void send().catch(() => undefined)} data-testid="send-phone-code">
          {t('authx.setup.sendCode')}
        </Button>
      )}
      <ApiErrorText error={request.error} />
    </div>
  );
}
