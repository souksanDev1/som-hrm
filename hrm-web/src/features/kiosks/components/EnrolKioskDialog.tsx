'use client';
import { createKioskSchema, type CreateKioskInput, type KioskEnrolment } from '@hrm/shared';
import { useEffect, useState } from 'react';
import { Button, Field, Input, Modal, Select, type SelectOption } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';

export interface EnrolKioskDialogProps {
  open: boolean;
  /** Branches with KIOSK mode (FR-WS-06.3). */
  branches: readonly SelectOption[];
  onEnrol(input: CreateKioskInput): Promise<KioskEnrolment>;
  onClose(): void;
}

/**
 * Enrol a kiosk tablet in two steps: branch + name, then the enrol code shown exactly once (only its hash is
 * stored by the API) to copy into the Tech Solutions Kiosk app.
 */
export function EnrolKioskDialog({ open, branches, onEnrol, onClose }: EnrolKioskDialogProps) {
  const t = useT();
  const [branchId, setBranchId] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<{ branchId?: string; name?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBranchId(branches.length === 1 ? branches[0]!.value : '');
    setName('');
    setErrors({});
    setCode(null);
    setCopied(false);
  }, [open, branches]);

  const submit = async () => {
    const parsed = createKioskSchema.safeParse({ branchId, name });
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setErrors({ branchId: issues.branchId?.[0], name: issues.name?.[0] });
      return;
    }
    setSaving(true);
    try {
      const res = await onEnrol(parsed.data);
      setErrors({});
      setCode(res.enrolCode);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.code : 'unknown' });
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (code) {
    return (
      <Modal
        open={open}
        title={t('kiosk.enrolCode')}
        onClose={onClose}
        footer={
          <Button onClick={onClose} data-testid="kiosk-code-done">
            {t('kiosk.done')}
          </Button>
        }
      >
        <div className="flex flex-col gap-3" data-testid="kiosk-code-step">
          <p className="rounded-sm bg-warning-soft px-3 py-2 text-sm text-ink dark:text-night-ink">{t('kiosk.enrolCodeOnce')}</p>
          <code data-testid="kiosk-enrol-code" className="select-all break-all rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-sm dark:border-night-line dark:bg-night-canvas">
            {code}
          </code>
          <div>
            <Button variant="secondary" size="sm" icon={copied ? 'check' : 'content_copy'} onClick={() => void copy()} data-testid="kiosk-code-copy">
              {t(copied ? 'kiosk.copied' : 'kiosk.copy')}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title={t('kiosk.add')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={saving} disabled={!branches.length} onClick={() => void submit()} data-testid="kiosk-enrol-submit">
            {t('kiosk.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="kiosk-enrol-form">
        {!branches.length && <p className="text-sm text-ink-muted" data-testid="kiosk-no-branch">{t('kiosk.noKioskBranch')}</p>}
        {errors.form && (
          <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
            {t(errors.form)}
          </p>
        )}
        <Field label={t('kiosk.branch')} htmlFor="kiosk-branch" hint={t('kiosk.branchHint')} error={errors.branchId && t(errors.branchId)} required>
          <Select id="kiosk-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branches} placeholder="—" invalid={!!errors.branchId} />
        </Field>
        <Field label={t('kiosk.name')} htmlFor="kiosk-name" error={errors.name && t(errors.name)} required>
          <Input id="kiosk-name" value={name} maxLength={100} placeholder={t('kiosk.namePlaceholder')} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />
        </Field>
      </div>
    </Modal>
  );
}
