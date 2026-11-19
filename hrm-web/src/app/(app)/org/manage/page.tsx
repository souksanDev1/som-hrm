'use client';
import { PERMISSIONS } from '@hrm/shared';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { DepartmentTreeEditor } from '@/features/org/components/DepartmentTreeEditor';
import { useT } from '@/lib/i18n';

export default function OrgManagePage() {
  const t = useT();
  return (
    <RequirePermission permission={PERMISSIONS.ORG_WRITE}>
      <PageHeader
        title={t('org.manage.title')}
        actions={
          <Link href="/org">
            <Button variant="secondary" icon="account_tree">
              {t('org.title')}
            </Button>
          </Link>
        }
      />
      <DepartmentTreeEditor />
    </RequirePermission>
  );
}
