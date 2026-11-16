'use client';
import { interpolate } from '@hrm/shared';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useUnreadCount } from './hooks';

/** Unread-notification counter for the navigation (polled every minute). Renders nothing at zero. */
export function UnreadBadge({ className }: { className?: string }) {
  const t = useT();
  const { data } = useUnreadCount();
  const count = data?.count ?? 0;
  if (count === 0) return null;
  return (
    <span
      data-testid="unread-badge"
      aria-label={interpolate(t('notif.unreadCount'), { count })}
      className={cn('inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold leading-5 text-white tabular-nums', className)}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
