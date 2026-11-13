'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { NavItem } from './nav';

/** Bottom navigation for phones/tablets (hidden on large screens). */
export function MobileTabBar({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const t = useT();
  const tabs = items.filter((i) => i.mobile);
  return (
    <nav
      aria-label="mobile"
      className="fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-white pb-[env(safe-area-inset-bottom)] dark:border-night-line dark:bg-night-surface lg:hidden"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', active ? 'text-primary' : 'text-ink-muted')}
          >
            <Icon name={item.icon} className="text-[22px]" />
            <span className="truncate">{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
