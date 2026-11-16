'use client';
import { useRouter } from 'next/navigation';
import { Button, Icon } from '@/components/ui';
import { useChangeLocale, useLogout } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { usePrefsStore, useT } from '@/lib/i18n';

export function Topbar() {
  const t = useT();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { locale, theme, toggleTheme } = usePrefsStore();
  const changeLocale = useChangeLocale();
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b border-line bg-white/90 px-4 backdrop-blur dark:border-night-line dark:bg-night-surface/90 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink dark:text-night-ink">{user?.workspaceName}</p>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <Button variant="ghost" size="sm" onClick={() => changeLocale(locale === 'lo' ? 'en' : 'lo')} aria-label="language" data-testid="toggle-locale">
          {locale === 'lo' ? 'EN' : 'ລາວ'}
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="theme">
          <Icon name={theme === 'light' ? 'dark_mode' : 'light_mode'} className="text-[20px]" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => router.push('/account')} aria-label={t('authx.account.title')} data-testid="open-account">
          <Icon name="manage_accounts" className="text-[20px]" />
          <span className="hidden max-w-[12rem] truncate text-sm text-ink-muted md:inline">{user?.displayName}</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon="logout"
          data-testid="logout"
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
        >
          <span className="hidden sm:inline">{t('auth.logout')}</span>
        </Button>
      </div>
    </header>
  );
}
