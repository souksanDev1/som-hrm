'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Modal, QueryState, StateView } from '@/components/ui';
import { attendanceRequestsApi } from '@/features/attendance-requests/api';
import { CorrectionForm, CorrectionList } from '@/features/attendance-requests/components/Corrections';
import { useCreateCorrection, useMyCorrections } from '@/features/attendance-requests/hooks';
import { useT } from '@/lib/i18n';

/** Own time-correction requests (FR-ATT-19); every employee with a record may file one. */
export default function CorrectionsPage() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const query = useMyCorrections();
  const create = useCreateCorrection();
  return (
    <>
      <PageHeader
        title={t('attreq.correction.title')}
        description={t('attreq.correction.subtitle')}
        actions={
          <Button icon="edit_calendar" onClick={() => setOpen(true)} data-testid="correction-new">
            {t('attreq.correction.new')}
          </Button>
        }
      />
      <Card title={t('attreq.correction.mine')}>
        <QueryState query={query}>
          {(items) => (items.length === 0 ? <StateView kind="empty" title={t('attreq.correction.empty')} /> : <CorrectionList items={items} />)}
        </QueryState>
      </Card>
      <Modal open={open} title={t('attreq.correction.new')} onClose={() => setOpen(false)}>
        <CorrectionForm onSubmit={(input) => create.mutateAsync(input)} onUpload={attendanceRequestsApi.uploadAttachment} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
