'use client';
import { useState } from 'react';
import { Button, Card, Modal } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { useIssueCredential } from '../hooks';

export interface CredentialCardProps {
  employeeId: string;
  hasLogin: boolean;
  hasEmail: boolean;
}

/** HR issues or resets a PIN/password; the temporary secret is shown exactly once. */
export function CredentialCard({ employeeId, hasLogin, hasEmail }: CredentialCardProps) {
  const t = useT();
  const issue = useIssueCredential(employeeId);
  const [secret, setSecret] = useState<string | null>(null);

  const run = async (method: 'PIN' | 'PASSWORD') => {
    const res = await issue.mutateAsync(method);
    setSecret(res.temporarySecret);
  };

  return (
    <Card title={t(hasLogin ? 'employee.resetPin' : 'employee.createLogin')}>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon="pin" loading={issue.isPending && issue.variables === 'PIN'} onClick={() => void run('PIN').catch(() => undefined)} data-testid="issue-pin">
          {t(hasLogin ? 'employee.resetPin' : 'auth.usePin')}
        </Button>
        {hasEmail && (
          <Button variant="secondary" icon="key" loading={issue.isPending && issue.variables === 'PASSWORD'} onClick={() => void run('PASSWORD').catch(() => undefined)}>
            {t('auth.usePassword')}
          </Button>
        )}
      </div>
      {issue.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">{t(issue.error instanceof ApiError ? issue.error.code : 'unknown')}</p>
      ) : null}
      <Modal open={!!secret} title={t('employee.temporarySecret')} onClose={() => setSecret(null)} footer={<Button onClick={() => setSecret(null)}>OK</Button>}>
        <p className="text-center text-3xl font-semibold tracking-[0.3em] tabular-nums text-ink dark:text-night-ink" data-testid="temporary-secret">
          {secret}
        </p>
      </Modal>
    </Card>
  );
}
