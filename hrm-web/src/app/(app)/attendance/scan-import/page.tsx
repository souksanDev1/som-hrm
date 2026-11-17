'use client';
import { PERMISSIONS } from '@hrm/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { ScanImport } from '@/features/scan-import/components/ScanImport';
import { ScanImportHistory } from '@/features/scan-import/components/ScanImportHistory';
import { useT } from '@/lib/i18n';

export default function ScanImportPage() {
  const t = useT();
  return (
    <RequirePermission permission={PERMISSIONS.SCAN_IMPORT}>
      <PageHeader title={t('scan.title')} description={t('scan.subtitle')} />
      <div className="flex flex-col gap-4">
        <ScanImport />
        <ScanImportHistory />
      </div>
    </RequirePermission>
  );
}
