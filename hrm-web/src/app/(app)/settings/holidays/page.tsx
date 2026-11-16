'use client';
import { HOLIDAY_KINDS, PERMISSIONS, type Holiday } from '@hrm/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, ConfirmDialog, QueryState } from '@/components/ui';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { holidaysApi } from '@/features/holidays/api';
import { HolidayList } from '@/features/holidays/components/HolidayList';
import { emptyHolidayValues, holidayFormValues, parseHolidayForm } from '@/features/holidays/form';
import { useHolidayMutation, useHolidays } from '@/features/holidays/hooks';
import { EntityFormDialog } from '@/features/org/components/EntityFormDialog';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

type Editing = { mode: 'create' } | { mode: 'edit'; holiday: Holiday } | null;

/** Holiday calendar (FR-WS-04/05): statutory defaults per year, festivals, substitute days and per-nationality national days. */
export default function HolidaysPage() {
  const t = useT();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useHolidays(year);
  const create = useHolidayMutation(holidaysApi.create);
  const update = useHolidayMutation((r: { id: string; body: Parameters<typeof holidaysApi.update>[1] }) => holidaysApi.update(r.id, r.body));
  const remove = useHolidayMutation(holidaysApi.remove);
  const ensure = useHolidayMutation(holidaysApi.ensureYear);
  const actionError = ensure.error ?? remove.error;

  const changeYear = (delta: number) => {
    setNotice(null);
    setYear((y) => y + delta);
  };

  return (
    <RequirePermission permission={PERMISSIONS.ORG_WRITE}>
      <PageHeader
        title={t('holiday.title')}
        description={t('holiday.subtitle')}
        actions={
          <Button icon="add" onClick={() => setEditing({ mode: 'create' })} data-testid="holiday-add">
            {t('holiday.add')}
          </Button>
        }
      />
      <Card
        title={
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ghost" icon="chevron_left" aria-label={t('common.previous')} onClick={() => changeYear(-1)} />
            <span data-testid="holiday-year" className="tabular-nums">{`${t('holiday.year')} ${year}`}</span>
            <Button size="sm" variant="ghost" icon="chevron_right" aria-label={t('common.next')} onClick={() => changeYear(1)} />
          </span>
        }
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon="event_available"
            loading={ensure.isPending}
            data-testid="holiday-ensure"
            onClick={() =>
              void ensure
                .mutateAsync(year)
                .then((r) => setNotice(t('holiday.defaultsAdded').replace('{count}', String(r.created))))
                .catch(() => undefined)
            }
          >
            {t('holiday.ensureDefaults').replace('{year}', String(year))}
          </Button>
        }
      >
        {notice && <p role="status" className="mb-2 text-sm text-success">{notice}</p>}
        {actionError ? <p role="alert" className="mb-2 text-sm text-danger">{t(actionError instanceof ApiError ? actionError.code : 'unknown')}</p> : null}
        <QueryState query={query}>
          {(holidays) => (
            <HolidayList holidays={holidays} canEdit onEdit={(h) => setEditing({ mode: 'edit', holiday: h })} onDelete={setDeleting} />
          )}
        </QueryState>
      </Card>

      <EntityFormDialog
        open={!!editing}
        title={t(editing?.mode === 'edit' ? 'holiday.edit' : 'holiday.add')}
        testId="holiday-form"
        initial={editing?.mode === 'edit' ? holidayFormValues(editing.holiday) : emptyHolidayValues(year)}
        saving={create.isPending || update.isPending}
        fields={[
          { name: 'date', label: t('holiday.date'), type: 'date', required: true },
          { name: 'nameLo', label: t('holiday.nameLo'), required: true },
          { name: 'nameEn', label: t('holiday.nameEn'), required: true },
          { name: 'kind', label: t('holiday.kind'), type: 'select', options: HOLIDAY_KINDS.map((k) => ({ value: k, label: t(`holiday.kind.${k}`) })) },
          { name: 'womenOnly', label: t('holiday.womenOnly'), type: 'checkbox' },
          { name: 'nationality', label: t('holiday.nationality'), hint: t('holiday.nationalityHint') },
        ]}
        parse={parseHolidayForm}
        onSubmit={(body) => (editing?.mode === 'edit' ? update.mutateAsync({ id: editing.holiday.id, body }) : create.mutateAsync(body))}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        title={t('holiday.deleteTitle')}
        message={t('holiday.deleteMessage')
          .replace('{name}', deleting?.nameLo ?? '')
          .replace('{date}', deleting?.date ?? '')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          void remove
            .mutateAsync(deleting.id)
            .catch(() => undefined)
            .finally(() => setDeleting(null));
        }}
      />
    </RequirePermission>
  );
}
