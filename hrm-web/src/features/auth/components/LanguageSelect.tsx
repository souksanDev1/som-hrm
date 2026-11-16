'use client';
import { LOCALES, type Locale } from '@hrm/shared';
import { cn } from '@/lib/cn';
import { usePrefsStore, useT } from '@/lib/i18n';
import { useChangeLocale } from '../hooks';

/** Lao / English segmented choice; saved on the account when signed in (FR-WS-07.2). */
export function LanguageSelect({ className }: { className?: string }) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const changeLocale = useChangeLocale();
  return (
    <div role="radiogroup" aria-label={t('authx.account.language')} className={cn('grid grid-cols-2 rounded-sm bg-canvas p-1 dark:bg-night-line', className)}>
      {LOCALES.map((l: Locale) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          data-testid={`locale-${l}`}
          onClick={() => changeLocale(l)}
          className={cn('rounded-sm py-2 text-sm font-medium', locale === l ? 'bg-white text-primary shadow-sm dark:bg-night-surface' : 'text-ink-muted')}
        >
          {t(`authx.language.${l}`)}
        </button>
      ))}
    </div>
  );
}
