'use client';
import {
  EMPLOYEE_IMPORT_COLUMNS,
  EMPLOYEE_IMPORT_SAMPLE_COLUMNS,
  interpolate,
  type EmployeeImportError,
  type EmployeeImportPreview,
} from '@hrm/shared';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export interface ImportPreviewProps {
  preview: Pick<EmployeeImportPreview, 'rows' | 'errors' | 'sample'>;
}

const th = 'py-2 pr-3 font-medium';
const td = 'py-2 pr-3';

/** Result of an import preview (FR-EMP-09.2): every error with row, column and reason, then the sample rows. */
export function ImportPreview({ preview }: ImportPreviewProps) {
  const t = useT();
  const errorRows = new Set(preview.errors.map((e) => e.row));
  const columnLabel = (column: EmployeeImportError['column']) => {
    if (column === null) return t('empx.import.wholeRow');
    const known = EMPLOYEE_IMPORT_COLUMNS.find((c) => c.key === column);
    return known ? t(known.labelKey) : column;
  };
  const hasErrors = preview.errors.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div
        role={hasErrors ? 'alert' : 'status'}
        data-testid="import-summary"
        className={cn('flex items-start gap-2 rounded-sm p-3 text-sm', hasErrors ? 'bg-danger/10 text-danger' : 'bg-primary-soft text-primary')}
      >
        <Icon name={hasErrors ? 'error' : 'check_circle'} className="text-[20px]" />
        <p>
          {interpolate(t('empx.import.rows'), { count: preview.rows })} ·{' '}
          {hasErrors ? interpolate(t('empx.import.hasErrors'), { count: preview.errors.length }) : t('empx.import.valid')}
        </p>
      </div>

      {hasErrors && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{t('empx.import.errors')}</h3>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm" data-testid="import-errors">
              <thead className="border-b border-line text-xs uppercase text-ink-muted dark:border-night-line">
                <tr>
                  <th className={th}>{t('empx.import.row')}</th>
                  <th className={th}>{t('empx.import.column')}</th>
                  <th className={th}>{t('empx.import.reason')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.errors.map((e, i) => (
                  <tr key={`${e.row}-${e.column}-${e.code}-${i}`} className="border-b border-line last:border-0 dark:border-night-line" data-testid="import-error">
                    <td className={cn(td, 'tabular-nums')}>{e.row}</td>
                    <td className={td}>{columnLabel(e.column)}</td>
                    <td className={cn(td, 'text-danger')}>{t(e.code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {preview.sample.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink dark:text-night-ink">{t('empx.import.sample')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="import-sample">
              <thead className="border-b border-line text-xs uppercase text-ink-muted dark:border-night-line">
                <tr>
                  <th className={th}>{t('empx.import.row')}</th>
                  {EMPLOYEE_IMPORT_SAMPLE_COLUMNS.map((key) => (
                    <th key={key} className={cn(th, 'whitespace-nowrap')}>
                      {columnLabel(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((r) => {
                  const invalid = errorRows.has(r.row);
                  return (
                    <tr
                      key={r.row}
                      data-testid="import-sample-row"
                      data-invalid={invalid || undefined}
                      className={cn('border-b border-line last:border-0 dark:border-night-line', invalid && 'bg-danger/10')}
                    >
                      <td className={cn(td, 'tabular-nums', invalid && 'font-semibold text-danger')}>{r.row}</td>
                      {EMPLOYEE_IMPORT_SAMPLE_COLUMNS.map((key) => (
                        <td key={key} className={cn(td, 'whitespace-nowrap')}>
                          {r.values[key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
