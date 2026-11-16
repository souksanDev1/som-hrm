'use client';
import { laoProvinceName, PERMISSIONS, type EmployeeDetail } from '@hrm/shared';
import type { ReactNode } from 'react';
import { Badge, Card } from '@/components/ui';
import { useHasPermission } from '@/features/auth/store';
import { usePrefsStore, useT } from '@/lib/i18n';
import { CredentialCard } from './CredentialCard';
import { DocumentsCard } from './DocumentsCard';
import { EmergencyContactsCard } from './EmergencyContactsCard';
import { HistoryCard } from './HistoryCard';
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
  const locale = usePrefsStore((s) => s.locale);
  const nameEn = [e.firstNameEn, e.lastNameEn].filter(Boolean).join(' ');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card title={t('nav.profile')} actions={<StatusBadge status={e.status} />}>
          <dl className="divide-y divide-line dark:divide-night-line">
            <Row label={t('employee.code')} value={e.employeeCode} />
            <Row label={t('empx.nameEn')} value={nameEn ? <span data-testid="name-en">{nameEn}</span> : null} />
            <Row label={t('employee.gender')} value={t(`gender.${e.gender}`)} />
            <Row label={t('employee.dateOfBirth')} value={e.dateOfBirth} />
            <Row label={t('employee.phone')} value={e.phone} />
            <Row label={t('employee.email')} value={e.email} />
            <Row label={t('empx.address.village')} value={e.village} />
            <Row label={t('empx.address.district')} value={e.district} />
            <Row label={t('empx.address.province')} value={laoProvinceName(e.province, locale)} />
            <Row label={t('empx.address.detail')} value={e.address} />
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
            <Row label={t('empx.ssnRegisteredAt')} value={e.ssnRegisteredAt} />
            <Row label={t('employee.familyBookNo')} value={e.familyBookNo} />
            <Row label={t('empx.familyBookHolder')} value={e.familyBookHolder} />
          </dl>
        </Card>
        <DocumentsCard employeeId={e.id} documents={e.documents} canEdit={canEdit} />
      </div>
      <div className="flex flex-col gap-4">
        <Card title={t('employee.employmentType')}>
          <dl className="divide-y divide-line dark:divide-night-line">
            <Row label={t('employee.hireDate')} value={e.hireDate} />
            <Row label={t('empx.contractType')} value={<span data-testid="contract-type">{t(`empx.contractType.${e.contractType}`)}</span>} />
            {e.contractEndDate && <Row label={t('empx.contractEndDate')} value={e.contractEndDate} />}
            {e.probationEndDate && <Row label={t('empx.probationEndDate')} value={e.probationEndDate} />}
            <Row label={t('empx.payType')} value={<span data-testid="pay-type">{t(`empx.payType.${e.payType}`)}</span>} />
            <Row label={t('employee.branch')} value={e.branch?.name} />
            <Row label={t('employee.department')} value={e.department?.name} />
            <Row label={t('employee.position')} value={e.position?.name} />
            <Row label={t('employee.manager')} value={e.manager?.name} />
            {e.hazardousWork && <Row label={t('employee.hazardousWork')} value={t('common.yes')} />}
          </dl>
        </Card>
        <EmergencyContactsCard employeeId={e.id} contacts={e.emergencyContacts} canEdit={canEdit} />
        <HistoryCard employeeId={e.id} />
        {canManageUsers && <CredentialCard employeeId={e.id} hasLogin={e.hasLogin} />}
      </div>
    </div>
  );
}
