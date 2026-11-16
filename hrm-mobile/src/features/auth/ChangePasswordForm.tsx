import { changePasswordSchema, type ChangePasswordInput } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button, TextField } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useChangePassword } from './hooks';

/** Replace a (temporary) password; used by the forced-change gate for password-only users. */
export function ChangePasswordForm({ onSuccess }: { onSuccess(): void }) {
  const t = useT();
  const change = useChangePassword();
  const { control, handleSubmit, formState } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const err = (m?: string) => (m ? t(m) : undefined);
  const submit = handleSubmit(async (v) => {
    await change.mutateAsync(v);
    onSuccess();
  });
  return (
    <View className="gap-4">
      <Controller control={control} name="currentPassword" render={({ field }) => (
        <TextField label={t('authx.password.current')} secureTextEntry autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={err(formState.errors.currentPassword?.message)} testID="input-current-password" />
      )} />
      <Controller control={control} name="newPassword" render={({ field }) => (
        <TextField label={t('authx.password.new')} secureTextEntry autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={err(formState.errors.newPassword?.message)} testID="input-new-password" />
      )} />
      <Text className="text-xs text-ink-muted">{t('authx.password.hint')}</Text>
      {change.error ? <Text accessibilityRole="alert" className="text-sm text-danger">{t(errorCode(change.error))}</Text> : null}
      <Button title={t('common.save')} loading={change.isPending} onPress={() => void submit().catch(() => undefined)} testID="change-password-submit" />
    </View>
  );
}
