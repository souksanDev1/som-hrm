'use client';
import { PERMISSIONS } from '@hrm/shared';
import Link from 'next/link';
import { Card, Icon } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuthStore, useHasPermission } from '@/features/auth/store';
import { useEmployees } from '@/features/employees/hooks';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const chipTones = [
  'bg-emerald-50 text-emerald-600',
  'bg-sky-50 text-sky-600',
  'bg-violet-50 text-violet-600',
  'bg-amber-50 text-amber-600',
];

function Stat({ icon, label, value, href, tone }: { icon: string; label: string; value?: number; href: string; tone: string }) {
  return (
    <Link href={href} className="transition-transform hover:-translate-y-0.5">
      <Card className="flex items-center gap-4 border-transparent shadow-card transition-shadow hover:shadow-lift">
        <span className={cn('flex h-12 w-12 items-center justify-center rounded-md', tone)}>
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
  const stats = [
    { icon: 'group', label: t('nav.employees'), value: all.data?.total, href: '/employees' },
    { icon: 'badge', label: t('status.ACTIVE'), value: active.data?.total, href: '/employees?status=ACTIVE' },
    { icon: 'public', label: t('nationality.FOREIGN'), value: foreign.data?.total, href: '/employees?nationalityType=FOREIGN' },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((s, i) => (
        <Stat key={s.href} {...s} tone={chipTones[i % chipTones.length] as string} />
      ))}
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
