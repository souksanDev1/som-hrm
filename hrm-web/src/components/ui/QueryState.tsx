'use client';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { StateView } from './StateView';

export interface QueryStateProps<T> {
  query: { data: T | undefined; isPending: boolean; error: unknown; refetch(): unknown };
  isEmpty?(data: T): boolean;
  children(data: T): ReactNode;
}

/** Standard loading / error / offline / empty handling for a TanStack query. */
export function QueryState<T>({ query, isEmpty, children }: QueryStateProps<T>) {
  const t = useT();
  if (query.isPending) {
    return (
      <div className="flex justify-center py-12 text-primary">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (query.error || query.data === undefined) {
    const err = query.error instanceof ApiError ? query.error : null;
    const kind = err?.code === 'network' ? 'offline' : err?.status === 403 ? 'forbidden' : err?.status === 404 ? 'notFound' : 'error';
    const titleKey = { offline: 'state.offline.title', forbidden: 'state.forbidden.title', notFound: 'state.notFound.title', error: 'state.error.title' }[kind];
    return (
      <StateView
        kind={kind}
        title={t(titleKey)}
        description={kind === 'error' ? t('state.error.body') : undefined}
        action={kind === 'forbidden' ? undefined : <Button variant="secondary" icon="refresh" onClick={() => void query.refetch()}>{t('common.retry')}</Button>}
      />
    );
  }
  if (isEmpty?.(query.data)) return <StateView kind="empty" title={t('common.empty')} />;
  return <>{children(query.data)}</>;
}
