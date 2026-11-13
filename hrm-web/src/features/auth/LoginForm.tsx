'use client';
import { passwordLoginSchema, pinLoginSchema, type PasswordLoginInput, type PinLoginInput } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { Button, Field, Input, PasswordInput } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useLogin } from './hooks';

type Mode = 'PASSWORD' | 'PIN';
type FormValues = PasswordLoginInput & PinLoginInput;

const pinResolver = zodResolver(pinLoginSchema);
const passwordResolver = zodResolver(passwordLoginSchema);

export interface LoginFormProps {
  defaultWorkspaceCode?: string;
  onSuccess(): void;
}

/** Sign-in with email/password (office) or employee code/phone + PIN (field staff). */
export function LoginForm({ defaultWorkspaceCode = '', onSuccess }: LoginFormProps) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('PASSWORD');
  const login = useLogin();
  const { register, handleSubmit, formState } = useForm<FormValues>({
    // Two schemas share one form; the active one validates its subset of fields.
    resolver: (mode === 'PIN' ? pinResolver : passwordResolver) as unknown as Resolver<FormValues>,
    defaultValues: { workspaceCode: defaultWorkspaceCode, identifier: '', password: '', pin: '' },
  });
  const err = (msg?: string) => (msg ? t(msg) : undefined);
  const apiError = login.error instanceof ApiError ? login.error.code : login.error ? 'unknown' : null;

  const onSubmit = handleSubmit(async (values) => {
    await login.mutateAsync(
      mode === 'PIN'
        ? { method: 'PIN', workspaceCode: values.workspaceCode, identifier: values.identifier, pin: values.pin }
        : { method: 'PASSWORD', workspaceCode: values.workspaceCode, identifier: values.identifier, password: values.password },
    );
    onSuccess();
  });

  return (
    <form onSubmit={(e) => void onSubmit(e).catch(() => undefined)} noValidate className="flex flex-col gap-4" data-testid="login-form">
      <div role="tablist" className="grid grid-cols-2 rounded-sm bg-canvas p-1 dark:bg-night-line">
        {(['PASSWORD', 'PIN'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              login.reset();
            }}
            className={cn('rounded-sm py-2 text-sm font-medium', mode === m ? 'bg-white text-primary shadow-sm dark:bg-night-surface' : 'text-ink-muted')}
          >
            {t(m === 'PIN' ? 'auth.usePin' : 'auth.usePassword')}
          </button>
        ))}
      </div>

      <Field label={t('auth.workspaceCode')} htmlFor="workspaceCode" error={err(formState.errors.workspaceCode?.message)} required>
        <Input id="workspaceCode" autoComplete="organization" autoCapitalize="none" invalid={!!formState.errors.workspaceCode} {...register('workspaceCode')} />
      </Field>

      <Field
        label={t(mode === 'PIN' ? 'auth.identifierPin' : 'auth.identifier')}
        htmlFor="identifier"
        error={err(formState.errors.identifier?.message)}
        required
      >
        <Input id="identifier" autoComplete="username" autoCapitalize="none" invalid={!!formState.errors.identifier} {...register('identifier')} />
      </Field>

      {mode === 'PIN' ? (
        <Field label={t('auth.pin')} htmlFor="pin" error={err(formState.errors.pin?.message)} required>
          <PasswordInput id="pin" inputMode="numeric" maxLength={6} autoComplete="one-time-code" invalid={!!formState.errors.pin} {...register('pin')} />
        </Field>
      ) : (
        <Field label={t('auth.password')} htmlFor="password" error={err(formState.errors.password?.message)} required>
          <PasswordInput id="password" autoComplete="current-password" invalid={!!formState.errors.password} {...register('password')} />
        </Field>
      )}

      {apiError && (
        <p role="alert" data-testid="login-error" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(apiError)}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth loading={formState.isSubmitting}>
        {t('auth.submit')}
      </Button>
      <p className="text-center text-xs text-ink-muted">{t('auth.forgot')}</p>
    </form>
  );
}
