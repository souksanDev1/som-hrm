import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ApiError } from '@hrm/shared';
import { StateScreen } from './StateScreen';

export interface QueryViewProps<T> {
  query: { data: T | undefined; isPending: boolean; error: unknown; refetch(): unknown };
  isEmpty?(data: T): boolean;
  children(data: T): ReactNode;
}

/** Standard loading / offline / error / empty handling for a TanStack query. */
export function QueryView<T>({ query, isEmpty, children }: QueryViewProps<T>) {
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <ActivityIndicator color="#1F5FD6" />
      </View>
    );
  }
  if (query.error || query.data === undefined) {
    const err = query.error instanceof ApiError ? query.error : null;
    const kind = err?.code === 'network' ? 'offline' : err?.status === 403 ? 'forbidden' : 'error';
    return <StateScreen kind={kind} onRetry={kind === 'forbidden' ? undefined : () => void query.refetch()} />;
  }
  if (isEmpty?.(query.data)) return <StateScreen kind="empty" />;
  return <>{children(query.data)}</>;
}
