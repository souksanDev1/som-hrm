'use client';
import { PERMISSIONS, type EmployeeDetail } from '@hrm/shared';
import type { ReactNode } from 'react';
import { Badge, Card } from '@/components/ui';
import { useHasPermission } from '@/features/auth/store';
import { useT } from '@/lib/i18n';
import { CredentialCard } from './CredentialCard';
import { DocumentsCard } from './DocumentsCard';
import { StatusBadge } from './StatusBadge';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="text-sm text-ink-muted sm:w-48 sm:shrink-0">{label}</dt>
      <dd className="text-sm tabular-nums text-ink dark:text-night-ink">{value ?? '—'}</dd>
    </div>
  );
}

export function EmployeeProfile({ employee: e }: { employee: EmployeeDetail }) {
  const t = useT();
  const canEdit = useHasPermission(PERMISSIONS.EMPLOYEE_WRITE);
  const canManageUsers = useHasPermission(PERMISSIONS.USER_MANAGE);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card title={t('nav.profile')} actions={<StatusBadge status={e.status} />}>
          <dl className="divide-y divide-line dark:divide-night-line">
            <Row label={t('employee.code')} value={e.employeeCode} />
            <Row label={t('employee.gender')} value={t(`gender.${e.gender}`)} />
            <Row label={t('employee.dateOfBirth')} value={e.dateOfBirth} />
            <Row label={t('employee.phone')} value={e.phone} />
            <Row label={t('employee.email')} value={e.email} />
            <Row label={t('employee.address')} value={e.address} />
            <Row
              label={t('employee.nationalityType')}
              value={
                <span className="flex items-center gap-2">
                  {t(`nationality.${e.nationalityType}`)} {e.nationality && <Badge>{e.nationality}</Badge>}
                </span>
              }
            />
            <Row label={t('employee.idCardNo')} value={e.idCardNo} />
            <Row label={t('employee.socialSecurityNo')} value={<span data-testid="ssn">{e.socialSecurityNo ?? '—'}</span>} />
            <Row label={t('employee.familyBookNo')} value={e.familyBookNo} />
          </dl>
        </Card>
        <DocumentsCard employeeId={e.id} documents={e.documents} canEdit={canEdit} />
      </div>
      <div className="flex flex-col gap-4">
        <Card title={t('employee.employmentType')}>
          <dl className="divide-y divide-line dark:divide-night-line">
            <Row label={t('employee.hireDate')} value={e.hireDate} />
            <Row label={t('employee.employmentType')} value={t(`employmentType.${e.employmentType}`)} />
            <Row label={t('employee.branch')} value={e.branch?.name} />
            <Row label={t('employee.department')} value={e.department?.name} />
            <Row label={t('employee.position')} value={e.position?.name} />
            <Row label={t('employee.manager')} value={e.manager?.name} />
            {e.hazardousWork && <Row label={t('employee.hazardousWork')} value={t('common.yes')} />}
          </dl>
        </Card>
        <Card title={t('employee.emergencyContacts')}>
          {e.emergencyContacts.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('common.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {e.emergencyContacts.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium text-ink dark:text-night-ink">{c.name}</span>{' '}
                  <span className="text-ink-muted">({c.relationship})</span>
                  <span className="block tabular-nums text-ink-muted">{c.phone}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {canManageUsers && <CredentialCard employeeId={e.id} hasLogin={e.hasLogin} hasEmail={!!e.email} />}
      </div>
    </div>
  );
}
