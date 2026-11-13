import type { ReactNode } from 'react';
import { Icon } from './Icon';

export type StateKind = 'empty' | 'error' | 'forbidden' | 'notFound' | 'offline';

const icons: Record<StateKind, string> = {
  empty: 'inbox',
  error: 'error',
  forbidden: 'lock',
  notFound: 'search_off',
  offline: 'wifi_off',
};

export interface StateViewProps {
  kind: StateKind;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Shared empty / error / forbidden / offline placeholder. */
export function StateView({ kind, title, description, action }: StateViewProps) {
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} data-state={kind} className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon name={icons[kind]} />
      </span>
      <h2 className="text-base font-semibold text-ink dark:text-night-ink">{title}</h2>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}
