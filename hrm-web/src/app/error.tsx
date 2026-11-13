'use client';
import { Button, StateView } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function ErrorPage({ reset }: { error: Error; reset(): void }) {
  const t = useT();
  return (
    <StateView
      kind="error"
      title={t('state.error.title')}
      description={t('state.error.body')}
      action={<Button onClick={reset}>{t('common.retry')}</Button>}
    />
  );
}
