'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card } from '@/components/ui';
import { AuthScreen } from '@/features/auth/components/AuthScreen';
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';
import { useHydrated } from '@/lib/use-hydrated';

export default function ForgotPasswordPage() {
  const t = useT();
  const hydrated = useHydrated();
  const lastWorkspaceCode = useAuthStore((s) => s.lastWorkspaceCode);
  const [done, setDone] = useState(false);

  return (
    <AuthScreen
      title={t('authx.forgot.title')}
      loading={!hydrated}
      footer={
        <Link href="/login" className="text-primary hover:underline" data-testid="back-to-login">
          {t('authx.forgot.backToLogin')}
        </Link>
      }
    >
      <Card>
        {done ? (
          <p role="status" data-testid="reset-done" className="text-sm text-ink dark:text-night-ink">{t('authx.forgot.done')}</p>
        ) : (
          <ForgotPasswordForm defaultWorkspaceCode={lastWorkspaceCode} onDone={() => setDone(true)} />
        )}
      </Card>
    </AuthScreen>
  );
}
