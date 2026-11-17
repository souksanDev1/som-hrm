'use client';
import { resolveNotificationLink, type NotificationItem } from '@hrm/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Icon, Pagination, QueryState, StateView } from '@/components/ui';
import { cn } from '@/lib/cn';
import { usePrefsStore, useT } from '@/lib/i18n';
import { useMarkAllRead, useMarkRead, useNotifications } from './hooks';

const PAGE_SIZE = 20;

/** In-app notification center (FR-NOTI-04.1/04.2): list, unread filter, mark read, open the linked screen. */
export function NotificationCenter() {
  const t = useT();
  const router = useRouter();
  const locale = usePrefsStore((s) => s.locale);
  const [unread, setUnread] = useState(false);
  const [page, setPage] = useState(1);
  const query = useNotifications({ page, pageSize: PAGE_SIZE, unread });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const open = async (n: NotificationItem) => {
    if (!n.readAt) await markRead.mutateAsync(n.id).catch(() => undefined);
    // Shared link mapping (FR-NOTI-04.2): links without a web screen keep the user on this list.
    const href = resolveNotificationLink(n.link, 'web');
    if (href) router.push(href);
  };
  const setFilter = (value: boolean) => {
    setUnread(value);
    setPage(1);
  };
  const formatTime = (iso: string) => new Date(iso).toLocaleString(locale === 'lo' ? 'lo-LA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={t('notif.title')} className="inline-flex rounded-sm border border-line p-0.5 dark:border-night-line">
          {([false, true] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              role="tab"
              aria-selected={unread === value}
              data-testid={value ? 'notif-filter-unread' : 'notif-filter-all'}
              onClick={() => setFilter(value)}
              className={cn('rounded-sm px-3 py-1 text-sm font-medium', unread === value ? 'bg-primary-soft text-primary' : 'text-ink-muted')}
            >
              {t(value ? 'notif.filter.unread' : 'notif.filter.all')}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" icon="done_all" loading={markAll.isPending} onClick={() => markAll.mutate()} data-testid="notif-mark-all">
          {t('notif.markAllRead')}
        </Button>
      </div>

      <QueryState query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <StateView kind="empty" title={t(unread ? 'notif.emptyUnread' : 'notif.empty')} />
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line dark:divide-night-line">
                {data.items.map((n) => (
                  <li key={n.id} data-testid="notification-row" data-unread={!n.readAt || undefined} className="flex items-start gap-2 py-3">
                    <button type="button" onClick={() => void open(n)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                      <span aria-hidden className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm text-ink dark:text-night-ink', !n.readAt && 'font-semibold')}>{n.title}</span>
                        <span className="block text-sm text-ink-muted">{n.body}</span>
                        <span className="block text-xs tabular-nums text-ink-muted">{formatTime(n.createdAt)}</span>
                      </span>
                    </button>
                    {!n.readAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('notif.markRead')}
                        title={t('notif.markRead')}
                        loading={markRead.isPending && markRead.variables === n.id}
                        onClick={() => markRead.mutate(n.id)}
                        data-testid="notif-mark-read"
                      >
                        <Icon name="check" className="text-[18px]" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} labels={{ previous: t('common.previous'), next: t('common.next') }} />
            </>
          )
        }
      </QueryState>
    </Card>
  );
}
