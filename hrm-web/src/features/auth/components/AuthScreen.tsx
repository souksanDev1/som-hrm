'use client';
import type { ReactNode } from 'react';
import { BrandMark, Spinner } from '@/components/ui';
import { usePrefsStore, useT } from '@/lib/i18n';
import { useChangeLocale } from '../hooks';

export interface AuthScreenProps {
  title: string;
  subtitle?: string;
  /** Show a spinner instead of children (e.g. until persisted stores hydrate). */
  loading?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

/** Centered card layout for the public/setup auth screens (no app shell). */
export function AuthScreen({ title, subtitle, loading, footer, children }: AuthScreenProps) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const changeLocale = useChangeLocale();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8 dark:bg-night-canvas">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-ink dark:text-night-ink">{title}</h1>
              <p className="truncate text-xs text-ink-muted">{subtitle ?? t('auth.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-sm px-2 py-1 text-sm text-primary hover:bg-primary-soft"
            onClick={() => changeLocale(locale === 'lo' ? 'en' : 'lo')}
          >
            {locale === 'lo' ? 'EN' : 'ລາວ'}
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10 text-primary"><Spinner /></div>
        ) : (
          children
        )}
        {footer && <div className="mt-4 text-center text-sm">{footer}</div>}
      </div>
    </main>
  );
}
