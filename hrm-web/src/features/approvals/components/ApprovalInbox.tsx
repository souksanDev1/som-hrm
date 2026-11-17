'use client';
import type { ApprovalInboxItem } from '@hrm/shared';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { fill } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';
import { CapacityBadge } from './ApprovalBadges';

/** Requests waiting for the signed-in user, oldest first; each row opens the request detail. */
export function ApprovalInbox({ items }: { items: readonly ApprovalInboxItem[] }) {
  const t = useT();
  return (
    <ul className="flex flex-col divide-y divide-line dark:divide-night-line" data-testid="approval-inbox">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="approval-row">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink dark:text-night-ink">{item.requester.name}</span>
              <span className="text-xs text-ink-muted">{item.requester.employeeCode}</span>
              <CapacityBadge capacity={item.myCapacity} />
            </div>
            <p className="text-sm text-ink dark:text-night-ink">
              {t(`approval.subject.${item.subjectType}`)} · {item.summary.title}
            </p>
            {item.summary.detail && <p className="text-sm text-ink-muted">{item.summary.detail}</p>}
            <p className="text-xs text-ink-muted">
              {fill(t('approval.level'), { level: item.level, total: item.requiredLevels })} · {fill(t('approval.pendingSince'), { date: item.pendingSince.slice(0, 10) })}
            </p>
          </div>
          <Link href={`/approvals/${item.id}`} className="shrink-0">
            <Button variant="secondary" size="sm" icon="open_in_new">
              {t('approval.open')}
            </Button>
          </Link>
        </li>
      ))}
    </ul>
  );
}
