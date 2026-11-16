import { verifyPhoneSchema, type VerifyPhoneInput } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button, TextField } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useConfirmPhoneOtp, useCountdown, useRequestPhoneOtp } from './hooks';

/** First-login phone verification (FR-AUTH-02.1): send an SMS code, then confirm it. */
export function VerifyPhoneForm({ onSuccess }: { onSuccess(): void }) {
  const t = useT();
  const request = useRequestPhoneOtp();
  const confirm = useConfirmPhoneOtp();
  const countdown = useCountdown();
  const { control, handleSubmit, formState } = useForm<VerifyPhoneInput>({ resolver: zodResolver(verifyPhoneSchema), defaultValues: { code: '' } });
  const send = async () => countdown.start((await request.mutateAsync()).resendAfterSeconds);
  const submit = handleSubmit(async (v) => {
    await confirm.mutateAsync(v);
    onSuccess();
  });
  const sentTo = request.data?.maskedPhone;

  return (
    <View className="gap-4">
      <Text className="text-sm text-ink-muted">{t('authx.setup.verifyPhoneIntro')}</Text>
      {request.data ? (
        <>
          {sentTo ? <Text testID="code-sent-to" className="text-sm text-ink dark:text-night-ink">{t('authx.setup.codeSentTo').replace('{phone}', sentTo)}</Text> : null}
          <Controller control={control} name="code" render={({ field }) => (
            <TextField label={t('authx.forgot.code')} keyboardType="number-pad" maxLength={8} textContentType="oneTimeCode" value={field.value} onChangeText={field.onChange} error={formState.errors.code?.message ? t(formState.errors.code.message) : undefined} testID="input-otp" />
          )} />
          {confirm.error ? <Text accessibilityRole="alert" className="text-sm text-danger">{t(errorCode(confirm.error))}</Text> : null}
          <Button title={t('authx.setup.confirm')} loading={confirm.isPending} onPress={() => void submit().catch(() => undefined)} testID="otp-confirm" />
          <Button
            title={countdown.secondsLeft > 0 ? t('authx.forgot.resendIn').replace('{seconds}', String(countdown.secondsLeft)) : t('authx.forgot.resend')}
            variant="ghost"
            disabled={countdown.secondsLeft > 0}
            loading={request.isPending}
            onPress={() => void send().catch(() => undefined)}
          />
        </>
      ) : (
        <Button title={t('authx.setup.sendCode')} loading={request.isPending} onPress={() => void send().catch(() => undefined)} testID="send-phone-code" />
      )}
      {request.error ? <Text accessibilityRole="alert" className="text-sm text-danger">{t(errorCode(request.error))}</Text> : null}
    </View>
  );
}
