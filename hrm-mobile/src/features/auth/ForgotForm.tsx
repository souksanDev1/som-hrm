import { forgotCredentialSchema, isWeakPin, otpCodeSchema, passwordSchema, pinSchema, type ForgotCredentialInput } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { z } from 'zod';
import { Button, Segmented, TextField } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useCountdown, useForgotCredential, useResetCredential } from './hooks';

type Kind = 'PIN' | 'PASSWORD';
const resetFields = z.object({ code: otpCodeSchema, secret: z.string() });
type ResetFields = z.infer<typeof resetFields>;

export interface ForgotFormProps {
  defaultWorkspaceCode?: string;
  onDone(): void;
}

/**
 * Self-service reset by SMS (FR-AUTH-02). PIN is the default (field staff); the confirmation is
 * generic because the API never reveals whether the account exists.
 */
export function ForgotForm({ defaultWorkspaceCode = '', onDone }: ForgotFormProps) {
  const t = useT();
  const [kind, setKind] = useState<Kind>('PIN');
  const forgot = useForgotCredential();
  const reset = useResetCredential();
  const countdown = useCountdown();
  const request = useForm<ForgotCredentialInput>({
    resolver: zodResolver(forgotCredentialSchema),
    defaultValues: { workspaceCode: defaultWorkspaceCode, identifier: '' },
  });
  const resetForm = useForm<ResetFields>({ resolver: zodResolver(resetFields), defaultValues: { code: '', secret: '' } });
  const err = (m?: string) => (m ? t(m) : undefined);

  const send = request.handleSubmit(async (v) => countdown.start((await forgot.mutateAsync(v)).resendAfterSeconds));
  const submit = resetForm.handleSubmit(async (v) => {
    // The secret's rule depends on the chosen kind; validate it with the shared schema.
    const check = (kind === 'PIN' ? pinSchema : passwordSchema).safeParse(v.secret);
    if (!check.success || (kind === 'PIN' && isWeakPin(v.secret))) {
      resetForm.setError('secret', { message: check.success ? 'pin_too_weak' : check.error.issues[0]?.message });
      return;
    }
    const base = { ...request.getValues(), code: v.code };
    await reset.mutateAsync(kind === 'PIN' ? { kind, ...base, newPin: v.secret } : { kind, ...base, newPassword: v.secret });
    onDone();
  });

  if (!forgot.data) {
    return (
      <View className="gap-4" testID="forgot-form">
        <Text className="text-sm text-ink-muted">{t('authx.forgot.intro')}</Text>
        <Controller control={request.control} name="workspaceCode" render={({ field }) => (
          <TextField label={t('auth.workspaceCode')} required autoCapitalize="none" autoCorrect={false} value={field.value} onChangeText={field.onChange} error={err(request.formState.errors.workspaceCode?.message)} testID="forgot-workspace" />
        )} />
        <Controller control={request.control} name="identifier" render={({ field }) => (
          <TextField label={t('authx.login.identifier')} required autoCapitalize="none" autoCorrect={false} value={field.value} onChangeText={field.onChange} error={err(request.formState.errors.identifier?.message)} testID="forgot-identifier" />
        )} />
        {forgot.error ? <Text accessibilityRole="alert" className="text-sm text-danger">{t(errorCode(forgot.error))}</Text> : null}
        <Button title={t('authx.forgot.send')} loading={forgot.isPending} onPress={() => void send().catch(() => undefined)} testID="forgot-send" fullWidth />
      </View>
    );
  }

  return (
    <View className="gap-4" testID="reset-form">
      <Text testID="forgot-sent" className="rounded-sm bg-primary-soft px-3 py-2 text-sm text-ink">{t('authx.forgot.sent')}</Text>
      <Text className="text-sm font-medium text-ink dark:text-night-ink">{t('authx.forgot.whatToReset')}</Text>
      <Segmented
        value={kind}
        onChange={(k) => {
          setKind(k);
          resetForm.setValue('secret', '');
        }}
        options={[
          { value: 'PIN', label: 'PIN', testID: 'reset-kind-pin' },
          { value: 'PASSWORD', label: t('auth.password'), testID: 'reset-kind-password' },
        ]}
      />
      <Controller control={resetForm.control} name="code" render={({ field }) => (
        <TextField label={t('authx.forgot.code')} required keyboardType="number-pad" maxLength={8} textContentType="oneTimeCode" value={field.value} onChangeText={field.onChange} error={err(resetForm.formState.errors.code?.message)} testID="reset-code" />
      )} />
      <Controller control={resetForm.control} name="secret" render={({ field }) => (
        <TextField
          label={t(kind === 'PIN' ? 'authx.forgot.newPin' : 'authx.forgot.newPassword')}
          required
          secureTextEntry
          autoCapitalize="none"
          keyboardType={kind === 'PIN' ? 'number-pad' : 'default'}
          maxLength={kind === 'PIN' ? 6 : 200}
          value={field.value}
          onChangeText={field.onChange}
          error={err(resetForm.formState.errors.secret?.message)}
          testID="reset-secret"
        />
      )} />
      {reset.error ? <Text accessibilityRole="alert" testID="reset-error" className="text-sm text-danger">{t(errorCode(reset.error))}</Text> : null}
      <Button title={t('authx.forgot.submit')} loading={reset.isPending} onPress={() => void submit().catch(() => undefined)} testID="reset-submit" fullWidth />
      <Button
        title={countdown.secondsLeft > 0 ? t('authx.forgot.resendIn').replace('{seconds}', String(countdown.secondsLeft)) : t('authx.forgot.resend')}
        variant="ghost"
        disabled={countdown.secondsLeft > 0}
        loading={forgot.isPending}
        onPress={() => void send().catch(() => undefined)}
      />
    </View>
  );
}
