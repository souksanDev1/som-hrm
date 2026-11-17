'use client';
import { formatDurationMinutes, interpolate } from '@hrm/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, Card, Field, Input, Modal, QueryState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { overtimeApi } from '@/features/overtime/api';
import { OvertimeRequestForm } from '@/features/overtime/components/OvertimeRequestForm';
import { OvertimeRequestList } from '@/features/overtime/components/OvertimeRequestList';
import { OvertimeSplitList } from '@/features/overtime/components/OvertimeSplit';
import { localToday, useCreateOvertime, useMyOvertime } from '@/features/overtime/hooks';
import { useT } from '@/lib/i18n';

/** My overtime (FR-ATT-20/23): request form with live breakdown, the month's requests and approved hours. */
function MyOvertimeView() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const today = localToday();
  const month = params.get('month') ?? today.slice(0, 7);
  const query = useMyOvertime(month);
  const create = useCreateOvertime();
  const [open, setOpen] = useState(params.get('new') === '1');
  const [submitted, setSubmitted] = useState(false);

  return (
    <>
      <PageHeader
        title={t('otx.mine.title')}
        description={t('otx.request.subtitle')}
        actions={
          <Button icon="more_time" onClick={() => setOpen(true)} data-testid="ot-new">
            {t('otx.mine.new')}
          </Button>
        }
      />
      {submitted && (
        <p className="mb-4 rounded-sm bg-success-soft px-3 py-2 text-sm text-success" data-testid="ot-submitted">
          {t('otx.submitted')}
        </p>
      )}
      <Card>
        <Field label={t('otx.month')} htmlFor="ot-month" className="mb-4 max-w-xs">
          <Input id="ot-month" type="month" value={month} onChange={(e) => e.target.value && router.replace(`/overtime?month=${e.target.value}`)} />
        </Field>
        <QueryState query={query}>
          {(data) => (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{t('otx.mine.approved')}</h2>
                <OvertimeSplitList split={data.approved} totalMinutes={data.approved.totalMinutes} data-testid="ot-approved" />
                {data.pendingMinutes > 0 && (
                  <p className="mt-2 text-xs text-ink-muted" data-testid="ot-pending">
                    {interpolate(t('otx.mine.pending'), { hours: formatDurationMinutes(data.pendingMinutes) })}
                  </p>
                )}
              </div>
              {data.items.length ? <OvertimeRequestList items={data.items} /> : <p className="text-sm text-ink-muted">{t('otx.mine.empty')}</p>}
            </div>
          )}
        </QueryState>
      </Card>
      <Modal open={open} title={t('otx.request.title')} onClose={() => setOpen(false)}>
        <OvertimeRequestForm
          today={today}
          onPreview={overtimeApi.preview}
          onSubmit={async (input) => {
            await create.mutateAsync(input);
            setOpen(false);
            setSubmitted(true);
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

export default function MyOvertimePage() {
  return (
    <Suspense>
      <MyOvertimeView />
    </Suspense>
  );
}
