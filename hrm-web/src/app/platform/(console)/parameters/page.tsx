'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryState } from '@/components/ui';
import { useSetSystemParameter, useSystemParameters } from '@/features/platform/hooks';
import { ParameterBoard } from '@/features/settings/parameters/components/ParameterBoard';
import { toDateTimeLocal } from '@/features/settings/parameters/format';
import { useT } from '@/lib/i18n';

const formatInstant = (iso: string) => toDateTimeLocal(new Date(iso)).replace('T', ' ');

/** System-level parameters (OTP, lockout) — SOM only (FR-WS-08.7). */
export default function PlatformParametersPage() {
  const t = useT();
  const query = useSystemParameters();
  const save = useSetSystemParameter();
  const [now] = useState(() => toDateTimeLocal(new Date()));
  return (
    <>
      <PageHeader title={t('param.systemTitle')} description={t('param.systemSubtitle')} />
      <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
        {(data) => (
          <ParameterBoard
            items={data.items}
            canEdit
            dateMode="datetime"
            defaultEffectiveFrom={now}
            formatEffective={formatInstant}
            onSubmit={(key, input) => save.mutateAsync({ key, ...input })}
          />
        )}
      </QueryState>
    </>
  );
}
