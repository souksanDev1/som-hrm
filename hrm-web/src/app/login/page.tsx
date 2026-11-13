'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { LoginForm } from '@/features/auth/LoginForm';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore, useT } from '@/lib/i18n';
import { useHydrated } from '@/lib/use-hydrated';

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const token = useAuthStore((s) => s.accessToken);
  const lastWorkspaceCode = useAuthStore((s) => s.lastWorkspaceCode);
  const { locale, setLocale } = usePrefsStore();

  useEffect(() => {
    if (hydrated && token) router.replace('/dashboard');
  }, [hydrated, token, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8 dark:bg-night-canvas">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-lg font-bold text-white">S</span>
            <div>
              <h1 className="text-lg font-semibold text-ink dark:text-night-ink">{t('auth.title')}</h1>
              <p className="text-xs text-ink-muted">{t('auth.subtitle')}</p>
            </div>
          </div>
          <button type="button" className="rounded-sm px-2 py-1 text-sm text-primary hover:bg-primary-soft" onClick={() => setLocale(locale === 'lo' ? 'en' : 'lo')}>
            {locale === 'lo' ? 'EN' : 'ລາວ'}
          </button>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm dark:border-night-line dark:bg-night-surface sm:p-6">
          {hydrated ? (
            <LoginForm defaultWorkspaceCode={lastWorkspaceCode} onSuccess={() => router.replace('/dashboard')} />
          ) : (
            <div className="flex justify-center py-10 text-primary"><Spinner /></div>
          )}
        </div>
      </div>
    </main>
  );
}
