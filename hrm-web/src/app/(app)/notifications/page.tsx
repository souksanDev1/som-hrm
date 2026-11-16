'use client';
import { PageHeader } from '@/components/layout/PageHeader';
import { NotificationCenter } from '@/features/notifications/NotificationCenter';
import { useT } from '@/lib/i18n';

export default function NotificationsPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('notif.title')} />
      <NotificationCenter />
    </>
  );
}
