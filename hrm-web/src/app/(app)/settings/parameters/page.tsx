'use client';
import { PERMISSIONS } from '@hrm/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryState, StateView } from '@/components/ui';
import { useAuthStore, useHasPermission } from '@/features/auth/store';
import { ParameterBoard } from '@/features/settings/parameters/components/ParameterBoard';
import { fill } from '@/features/settings/parameters/format';
import { useSetWorkspaceParameter, useWorkspaceParameters } from '@/features/settings/parameters/hooks';
import { useT } from '@/lib/i18n';

/** Workspace business parameters (FR-WS-08). HR can read; `settings.manage` can schedule changes. */
export default function ParametersPage() {
  const t = useT();
  const canRead = useAuthStore((s) => !!s.user?.permissions.some((p) => p === PERMISSIONS.SETTINGS_MANAGE || p === PERMISSIONS.ORG_WRITE));
  const canEdit = useHasPermission(PERMISSIONS.SETTINGS_MANAGE);
  const query = useWorkspaceParameters();
  const save = useSetWorkspaceParameter();

  if (!canRead) return <StateView kind="forbidden" title={t('state.forbidden.title')} />;
  return (
    <>
      <PageHeader
        title={t('param.title')}
        description={query.data ? `${t('param.subtitle')} · ${fill(t('param.asOf'), { date: query.data.asOf })}` : t('param.subtitle')}
      />
      <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
        {(data) => (
          <ParameterBoard
            items={data.items}
            canEdit={canEdit}
            defaultEffectiveFrom={data.asOf}
            onSubmit={(key, input) => save.mutateAsync({ key, ...input })}
          />
        )}
      </QueryState>
    </>
  );
}
