'use client';
import Link from 'next/link';
import { Button, StateView } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function NotFound() {
  const t = useT();
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <StateView
        kind="notFound"
        title={t('state.notFound.title')}
        action={
          <Link href="/dashboard">
            <Button variant="secondary">{t('common.back')}</Button>
          </Link>
        }
      />
    </div>
  );
}
