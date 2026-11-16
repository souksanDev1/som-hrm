'use client';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

/** Translated API error for a failed mutation, or nothing. */
export function ApiErrorText({ error, testId }: { error: unknown; testId?: string }) {
  const t = useT();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : 'unknown';
  return (
    <p role="alert" data-testid={testId} className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
      {t(code)}
    </p>
  );
}
