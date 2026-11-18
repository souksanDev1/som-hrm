'use client';
import { AttendanceMode, PERMISSIONS } from '@hrm/shared';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Checkbox, QueryState } from '@/components/ui';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { kiosksApi } from '@/features/kiosks/api';
import { EnrolKioskDialog } from '@/features/kiosks/components/EnrolKioskDialog';
import { KioskList } from '@/features/kiosks/components/KioskList';
import { useKioskMutation, useKiosks } from '@/features/kiosks/hooks';
import { useBranches } from '@/features/org/hooks';
import { useT } from '@/lib/i18n';

/** Kiosk tablets (FR-ATT-03.1, FR-WS-06.3): enrol (code shown once), last seen, revoke. */
export default function KiosksPage() {
  const t = useT();
  const [showRevoked, setShowRevoked] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const query = useKiosks(showRevoked);
  const branches = useBranches();
  const enrol = useKioskMutation(kiosksApi.enrol);
  const revoke = useKioskMutation(kiosksApi.revoke);
  const kioskBranches = useMemo(
    () => (branches.data ?? []).filter((b) => b.isActive && b.attendanceModes.includes(AttendanceMode.KIOSK)).map((b) => ({ value: b.id, label: b.name })),
    [branches.data],
  );

  return (
    <RequirePermission permission={PERMISSIONS.KIOSK_MANAGE}>
      <PageHeader
        title={t('kiosk.title')}
        description={t('kiosk.subtitle')}
        actions={
          <Button icon="add" onClick={() => setEnrolling(true)} data-testid="kiosk-add">
            {t('kiosk.add')}
          </Button>
        }
      />
      <div className="mb-4">
        <Checkbox id="kiosk-show-revoked" label={t('kiosk.showRevoked')} checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
      </div>
      <Card>
        <QueryState query={query}>{(kiosks) => <KioskList kiosks={kiosks} onRevoke={revoke.mutateAsync} />}</QueryState>
      </Card>
      <EnrolKioskDialog open={enrolling} branches={kioskBranches} onEnrol={enrol.mutateAsync} onClose={() => setEnrolling(false)} />
    </RequirePermission>
  );
}
