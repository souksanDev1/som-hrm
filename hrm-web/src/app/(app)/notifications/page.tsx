'use client';
import { Card, StateView } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useT } from '@/lib/i18n';

/** Notification inbox. Delivery (leave, corrections, document expiry) arrives in M3/M4. */
export default function NotificationsPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('nav.notifications')} />
      <Card>
        <StateView kind="empty" title={t('common.empty')} />
      </Card>
    </>
  );
}
