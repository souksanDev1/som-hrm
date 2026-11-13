'use client';
import { PERMISSIONS } from '@hrm/shared';
import Link from 'next/link';
import { Card, Icon } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuthStore, useHasPermission } from '@/features/auth/store';
import { useEmployees } from '@/features/employees/hooks';
import { useT } from '@/lib/i18n';

function Stat({ icon, label, value, href }: { icon: string; label: string; value?: number; href: string }) {
  return (
    <Link href={href}>
      <Card className="flex items-center gap-4 hover:border-primary">
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Icon name={icon} />
        </span>
        <div>
          <p className="text-sm text-ink-muted">{label}</p>
          <p className="text-2xl font-semibold tabular-nums text-ink dark:text-night-ink" data-testid={`stat-${icon}`}>
            {value ?? '—'}
          </p>
        </div>
      </Card>
    </Link>
  );
}

function HrStats() {
  const t = useT();
  const all = useEmployees({ pageSize: 1 });
  const active = useEmployees({ pageSize: 1, status: 'ACTIVE' });
  const foreign = useEmployees({ pageSize: 1, nationalityType: 'FOREIGN' });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Stat icon="group" label={t('nav.employees')} value={all.data?.total} href="/employees" />
      <Stat icon="badge" label={t('status.ACTIVE')} value={active.data?.total} href="/employees?status=ACTIVE" />
      <Stat icon="public" label={t('nationality.FOREIGN')} value={foreign.data?.total} href="/employees?nationalityType=FOREIGN" />
    </div>
  );
}

export default function DashboardPage() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const canSeeStaff = useHasPermission(PERMISSIONS.EMPLOYEE_READ);
  return (
    <>
      <PageHeader title={t('nav.dashboard')} description={user?.displayName} />
      {canSeeStaff ? <HrStats /> : <Card><p className="text-sm text-ink-muted">{user?.workspaceName}</p></Card>}
    </>
  );
}
