'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button, Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { usePrefsStore, useT } from '@/lib/i18n';
import { usePlatformLogout } from '../hooks';
import { usePlatformAuthStore } from '../store';

const NAV = [
  { href: '/platform', labelKey: 'platform.nav.workspaces', icon: 'domain' },
  { href: '/platform/parameters', labelKey: 'platform.nav.parameters', icon: 'tune' },
  { href: '/platform/audit', labelKey: 'platform.nav.audit', icon: 'history' },
] as const;

const isActive = (pathname: string, href: string) =>
  href === '/platform' ? pathname === '/platform' || pathname.startsWith('/platform/workspaces') : pathname.startsWith(href);

/** Layout of the SOM platform console: top bar + horizontally scrollable tabs (works on phones). */
export function PlatformShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const user = usePlatformAuthStore((s) => s.user);
  const { locale, setLocale } = usePrefsStore();
  const logout = usePlatformLogout();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas dark:bg-night-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur dark:border-night-line dark:bg-night-surface/95">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-ink text-sm font-bold text-white">S</span>
            <span className="truncate text-sm font-semibold text-ink dark:text-night-ink sm:text-base">{t('platform.title')}</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLocale(locale === 'lo' ? 'en' : 'lo')} aria-label="language">
              {locale === 'lo' ? 'EN' : 'ລາວ'}
            </Button>
            <span className="hidden max-w-[12rem] truncate text-sm text-ink-muted md:inline">{user?.displayName}</span>
            <Button
              variant="secondary"
              size="sm"
              icon="logout"
              data-testid="platform-logout"
              onClick={async () => {
                await logout();
                router.replace('/platform/login');
              }}
            >
              <span className="hidden sm:inline">{t('auth.logout')}</span>
            </Button>
          </div>
        </div>
        <nav aria-label="platform" className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium',
                  active ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink dark:hover:text-night-ink',
                )}
              >
                <Icon name={item.icon} className="text-[18px]" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-4 sm:px-6">{children}</main>
    </div>
  );
}
