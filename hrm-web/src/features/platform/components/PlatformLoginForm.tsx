'use client';
import { platformLoginSchema, type PlatformLoginInput } from '@hrm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, Field, Input, PasswordInput } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { usePlatformLogin } from '../hooks';

/** Email + password sign-in for SOM staff. */
export function PlatformLoginForm({ onSuccess }: { onSuccess(): void }) {
  const t = useT();
  const login = usePlatformLogin();
  const { register, handleSubmit, formState } = useForm<PlatformLoginInput>({
    resolver: zodResolver(platformLoginSchema),
    defaultValues: { email: '', password: '' },
  });
  const err = (msg?: string) => (msg ? t(msg) : undefined);
  const apiError = login.error instanceof ApiError ? login.error.code : login.error ? 'unknown' : null;

  const onSubmit = handleSubmit(async (values) => {
    await login.mutateAsync(values);
    onSuccess();
  });

  return (
    <form onSubmit={(e) => void onSubmit(e).catch(() => undefined)} noValidate className="flex flex-col gap-4" data-testid="platform-login-form">
      <Field label={t('platform.email')} htmlFor="platform-email" error={err(formState.errors.email?.message)} required>
        <Input id="platform-email" type="email" autoComplete="username" autoCapitalize="none" invalid={!!formState.errors.email} {...register('email')} />
      </Field>
      <Field label={t('auth.password')} htmlFor="platform-password" error={err(formState.errors.password?.message)} required>
        <PasswordInput id="platform-password" autoComplete="current-password" invalid={!!formState.errors.password} {...register('password')} />
      </Field>
      {apiError && (
        <p role="alert" data-testid="platform-login-error" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(apiError)}
        </p>
      )}
      <Button type="submit" size="lg" fullWidth loading={formState.isSubmitting}>
        {t('auth.submit')}
      </Button>
    </form>
  );
}
