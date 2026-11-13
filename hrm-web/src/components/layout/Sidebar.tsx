'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { NavItem } from './nav';

export function Sidebar({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const t = useT();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white px-3 py-4 dark:border-night-line dark:bg-night-surface lg:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-sm font-bold text-white">S</span>
        <span className="text-base font-semibold text-ink dark:text-night-ink">{t('app.name')}</span>
      </div>
      <nav aria-label="main" className="flex flex-col gap-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium',
                active ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-canvas dark:hover:bg-night-line',
              )}
            >
              <Icon name={item.icon} className="text-[20px]" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
