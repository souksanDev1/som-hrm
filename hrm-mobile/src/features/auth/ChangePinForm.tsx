import { changePinSchema, type ChangePinInput } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button, TextField } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useChangePin } from './hooks';

export function ChangePinForm({ onSuccess }: { onSuccess(): void }) {
  const t = useT();
  const change = useChangePin();
  const { control, handleSubmit, formState } = useForm<ChangePinInput>({
    resolver: zodResolver(changePinSchema),
    defaultValues: { currentPin: '', newPin: '' },
  });
  const err = (m?: string) => (m ? t(m) : undefined);
  const submit = handleSubmit(async (v) => {
    await change.mutateAsync(v);
    onSuccess();
  });
  return (
    <View className="gap-4">
      <Controller control={control} name="currentPin" render={({ field }) => (
        <TextField label={t('auth.currentPin')} secureTextEntry keyboardType="number-pad" maxLength={6} value={field.value} onChangeText={field.onChange} error={err(formState.errors.currentPin?.message)} testID="input-current-pin" />
      )} />
      <Controller control={control} name="newPin" render={({ field }) => (
        <TextField label={t('auth.newPin')} secureTextEntry keyboardType="number-pad" maxLength={6} value={field.value} onChangeText={field.onChange} error={err(formState.errors.newPin?.message)} testID="input-new-pin" />
      )} />
      {change.error ? <Text accessibilityRole="alert" className="text-sm text-danger">{t(errorCode(change.error))}</Text> : null}
      <Button title={t('common.save')} loading={change.isPending} onPress={() => void submit().catch(() => undefined)} testID="change-pin-submit" />
    </View>
  );
}
