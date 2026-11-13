'use client';
import type { ReactNode } from 'react';
import { StateView } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useHasPermission } from './store';

/** Renders a "forbidden" state instead of children when the permission is missing. */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const t = useT();
  const allowed = useHasPermission(permission);
  return allowed ? <>{children}</> : <StateView kind="forbidden" title={t('state.forbidden.title')} />;
}
