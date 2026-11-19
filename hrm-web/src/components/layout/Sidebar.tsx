'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark, Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { UnreadBadge } from '@/features/notifications/UnreadBadge';
import { activeNavHref, type NavItem } from './nav';

export function Sidebar({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const t = useT();
  const activeHref = activeNavHref(pathname, items);
  return (
    <aside className="bg-brand-sidebar hidden w-60 shrink-0 flex-col px-3 py-5 lg:flex">
      <div className="mb-7 flex items-center gap-2.5 px-2">
        <BrandMark size={36} />
        <span className="text-base font-semibold tracking-wide text-white">{t('app.name')}</span>
      </div>
      <nav aria-label="main" className="flex flex-col gap-1">
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon name={item.icon} className="text-[20px]" />
              <span className="flex-1">{t(item.labelKey)}</span>
              {item.badge === 'unreadNotifications' && <UnreadBadge />}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
