import { changePinSchema, type ChangePinInput } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button, TextField } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useChangePin } from './hooks';

export interface ChangePinFormProps {
  onSuccess(): void;
  /** False when the user has no PIN yet: the current-PIN field is hidden (initial PIN). Default true. */
  hasPin?: boolean;
}

export function ChangePinForm({ onSuccess, hasPin = true }: ChangePinFormProps) {
  const t = useT();
  const change = useChangePin();
  const { control, handleSubmit, formState } = useForm<ChangePinInput>({
    resolver: zodResolver(changePinSchema),
    defaultValues: { currentPin: hasPin ? '' : undefined, newPin: '' },
  });
  const err = (m?: string) => (m ? t(m) : undefined);
  const submit = handleSubmit(async (v) => {
    await change.mutateAsync(hasPin ? v : { newPin: v.newPin });
    onSuccess();
  });
  return (
    <View className="gap-4">
      {hasPin ? (
        <Controller control={control} name="currentPin" render={({ field }) => (
          <TextField label={t('auth.currentPin')} secureTextEntry keyboardType="number-pad" maxLength={6} value={field.value ?? ''} onChangeText={field.onChange} error={err(formState.errors.currentPin?.message)} testID="input-current-pin" />
        )} />
      ) : null}
      <Controller control={control} name="newPin" render={({ field }) => (
        <TextField label={t('auth.newPin')} secureTextEntry keyboardType="number-pad" maxLength={6} value={field.value} onChangeText={field.onChange} error={err(formState.errors.newPin?.message)} testID="input-new-pin" />
      )} />
      {change.error ? <Text accessibilityRole="alert" testID="change-pin-error" className="text-sm text-danger">{t(errorCode(change.error))}</Text> : null}
      <Button title={t(hasPin ? 'common.save' : 'authx.pin.set')} loading={change.isPending} onPress={() => void submit().catch(() => undefined)} testID="change-pin-submit" />
    </View>
  );
}
