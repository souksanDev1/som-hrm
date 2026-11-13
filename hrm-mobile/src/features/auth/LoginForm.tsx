import { passwordLoginSchema, pinLoginSchema, type LoginMethod, type PasswordLoginInput, type PinLoginInput } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button, Segmented, TextField } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useLogin } from './hooks';

type FormValues = PasswordLoginInput & PinLoginInput;
const pinResolver = zodResolver(pinLoginSchema) as unknown as Resolver<FormValues>;
const passwordResolver = zodResolver(passwordLoginSchema) as unknown as Resolver<FormValues>;

export interface LoginFormProps {
  defaultWorkspaceCode?: string;
  defaultMethod?: LoginMethod;
  onSuccess(): void;
}

/** PIN first: most field staff have no email. */
export function LoginForm({ defaultWorkspaceCode = '', defaultMethod = 'PIN', onSuccess }: LoginFormProps) {
  const t = useT();
  const [method, setMethod] = useState<LoginMethod>(defaultMethod);
  const login = useLogin();
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: method === 'PIN' ? pinResolver : passwordResolver,
    defaultValues: { workspaceCode: defaultWorkspaceCode, identifier: '', password: '', pin: '' },
  });
  const err = (m?: string) => (m ? t(m) : undefined);

  const submit = handleSubmit(async (v) => {
    await login.mutateAsync(
      method === 'PIN'
        ? { method, workspaceCode: v.workspaceCode, identifier: v.identifier, pin: v.pin }
        : { method, workspaceCode: v.workspaceCode, identifier: v.identifier, password: v.password },
    );
    onSuccess();
  });

  return (
    <View className="gap-4" testID="login-form">
      <Segmented
        value={method}
        onChange={(m) => {
          setMethod(m);
          login.reset();
        }}
        options={[
          { value: 'PIN', label: t('auth.usePin'), testID: 'tab-pin' },
          { value: 'PASSWORD', label: t('auth.usePassword'), testID: 'tab-password' },
        ]}
      />
      <Controller
        control={control}
        name="workspaceCode"
        render={({ field }) => (
          <TextField label={t('auth.workspaceCode')} required autoCapitalize="none" autoCorrect={false} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={err(formState.errors.workspaceCode?.message)} testID="input-workspace" />
        )}
      />
      <Controller
        control={control}
        name="identifier"
        render={({ field }) => (
          <TextField
            label={t(method === 'PIN' ? 'auth.identifierPin' : 'auth.identifier')}
            required
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={method === 'PASSWORD' ? 'email-address' : 'default'}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={err(formState.errors.identifier?.message)}
            testID="input-identifier"
          />
        )}
      />
      {method === 'PIN' ? (
        <Controller
          control={control}
          name="pin"
          render={({ field }) => (
            <TextField label={t('auth.pin')} required secureTextEntry keyboardType="number-pad" maxLength={6} value={field.value} onChangeText={field.onChange} error={err(formState.errors.pin?.message)} testID="input-pin" />
          )}
        />
      ) : (
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <TextField label={t('auth.password')} required secureTextEntry autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={err(formState.errors.password?.message)} testID="input-password" />
          )}
        />
      )}
      {login.error ? (
        <Text accessibilityRole="alert" testID="login-error" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(errorCode(login.error))}
        </Text>
      ) : null}
      <Button title={t('auth.submit')} loading={formState.isSubmitting} onPress={() => void submit().catch(() => undefined)} testID="login-submit" fullWidth />
      <Text className="text-center text-xs text-ink-muted">{t('auth.forgot')}</Text>
    </View>
  );
}
