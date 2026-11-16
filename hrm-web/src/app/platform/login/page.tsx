'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { PlatformLoginForm } from '@/features/platform/components/PlatformLoginForm';
import { usePlatformAuthStore, usePlatformHydrated } from '@/features/platform/store';
import { usePrefsStore, useT } from '@/lib/i18n';

export default function PlatformLoginPage() {
  const t = useT();
  const router = useRouter();
  const hydrated = usePlatformHydrated();
  const token = usePlatformAuthStore((s) => s.accessToken);
  const { locale, setLocale } = usePrefsStore();

  useEffect(() => {
    if (hydrated && token) router.replace('/platform');
  }, [hydrated, token, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8 dark:bg-night-canvas">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-lg font-bold text-white">S</span>
            <div>
              <h1 className="text-lg font-semibold text-ink dark:text-night-ink">{t('platform.login.title')}</h1>
              <p className="text-xs text-ink-muted">{t('platform.login.subtitle')}</p>
            </div>
          </div>
          <button type="button" className="rounded-sm px-2 py-1 text-sm text-primary hover:bg-primary-soft" onClick={() => setLocale(locale === 'lo' ? 'en' : 'lo')}>
            {locale === 'lo' ? 'EN' : 'ລາວ'}
          </button>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm dark:border-night-line dark:bg-night-surface sm:p-6">
          {hydrated ? (
            <PlatformLoginForm onSuccess={() => router.replace('/platform')} />
          ) : (
            <div className="flex justify-center py-10 text-primary"><Spinner /></div>
          )}
        </div>
      </div>
    </main>
  );
}
