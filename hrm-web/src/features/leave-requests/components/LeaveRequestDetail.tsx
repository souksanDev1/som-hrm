'use client';
import { interpolate, type LeaveRequest } from '@hrm/shared';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Badge, Button, Field, FileUpload, Modal, Textarea } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { LEAVE_STATUS_TONE, useLeaveTypeName, usePeriodLabel } from './LeaveViews';

export interface LeaveRequestDetailProps {
  request: LeaveRequest;
  /** Upload a file and attach it as the certificate (FR-LV-05.3). */
  onAttach(file: File): Promise<unknown>;
  /** POST /leave/requests/:id/cancel (FR-LV-12). */
  onCancel(reason: string): Promise<unknown>;
  onDownloadCertificate?(fileId: string): void;
}

const Row = ({ label, children, testID }: { label: string; children: ReactNode; testID?: string }) => (
  <div className="flex flex-wrap justify-between gap-2 py-2">
    <dt className="text-sm text-ink-muted">{label}</dt>
    <dd className="text-sm text-ink dark:text-night-ink" data-testid={testID}>
      {children}
    </dd>
  </div>
);

/**
 * One leave request: status, period, days, who filed it, certificate (attach while the request is open) and
 * cancellation — a pending request is withdrawn at once, an approved one goes through approval (reason needed).
 */
export function LeaveRequestDetail({ request: r, onAttach, onCancel, onDownloadCertificate }: LeaveRequestDetailProps) {
  const t = useT();
  const typeName = useLeaveTypeName();
  const period = usePeriodLabel();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const open = r.status === 'PENDING' || r.status === 'APPROVED';
  const cancelPending = r.cancelRequest?.status === 'PENDING';
  const canCancel = open && !cancelPending;
  const reasonRequired = r.status === 'APPROVED';

  const confirmCancel = async () => {
    if (reasonRequired && !reason.trim()) {
      setError('required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCancel(reason.trim());
      setCancelOpen(false);
      setNotice(reasonRequired ? 'lvr.detail.cancelRequested' : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'unknown');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="leave-detail">
      {notice && (
        <p className="rounded-sm bg-success-soft px-3 py-2 text-sm text-success" data-testid="leave-notice">
          {t(notice)}
        </p>
      )}
      <dl className="divide-y divide-line dark:divide-night-line">
        <Row label={t('lvr.detail.employee')}>{`${r.employeeCode} ${r.employeeName}`}</Row>
        <Row label={t('lvr.form.type')}>{typeName(r.leaveType)}</Row>
        <Row label={t('lvr.detail.period')} testID="leave-detail-period">
          {period(r)}
        </Row>
        <Row label={t('lvr.detail.days')} testID="leave-detail-days">
          {r.days}
        </Row>
        <Row label={t('lvr.detail.status')}>
          <span data-testid="leave-detail-status">
            <Badge tone={LEAVE_STATUS_TONE[r.status]}>{t(`approval.status.${r.status}`)}</Badge>
          </span>
          {cancelPending && (
            <span className="ml-2 text-xs text-warning" data-testid="leave-cancel-pending">
              {t('lvr.detail.cancelPending')}
            </span>
          )}
        </Row>
        <Row label={t('lvr.detail.filedBy')}>{`${t(`leave.filedAs.${r.filedAs}`)}${r.submittedByName ? ` · ${r.submittedByName}` : ''}`}</Row>
        {r.reason && <Row label={t('lvr.detail.reason')}>{r.reason}</Row>}
        {r.cancelledAt && <Row label={t('lvr.detail.cancelReason')}>{`${interpolate(t('lvr.detail.cancelledAt'), { date: r.cancelledAt.slice(0, 10) })}${r.cancelReason ? ` · ${r.cancelReason}` : ''}`}</Row>}
        <Row label={t('lvr.detail.certificate')} testID="leave-detail-certificate">
          {r.certificateFileId ? (
            onDownloadCertificate ? (
              <button type="button" className="text-primary underline" onClick={() => onDownloadCertificate(r.certificateFileId!)}>
                {t('lvr.detail.certificateAttached')}
              </button>
            ) : (
              t('lvr.detail.certificateAttached')
            )
          ) : r.certificateRequired ? (
            <span className="text-warning">{interpolate(t('lvr.detail.certificateMissing'), { due: r.certificateDueDate ?? '' })}</span>
          ) : (
            t('lvr.detail.certificateNotNeeded')
          )}
        </Row>
      </dl>

      <div className="flex flex-wrap gap-2">
        {open && (r.certificateRequired || r.certificateFileId) && (
          <FileUpload
            accept="application/pdf,image/jpeg,image/png"
            label={t('lvr.detail.attach')}
            onUpload={async (file) => {
              await onAttach(file);
              setNotice('lvr.detail.attached');
            }}
            data-testid="leave-attach"
          />
        )}
        {r.approvalRequestId && (
          <Link href={`/approvals/${r.approvalRequestId}`}>
            <Button variant="secondary" icon="approval">
              {t('lvr.detail.openApproval')}
            </Button>
          </Link>
        )}
        {canCancel && (
          <Button variant="danger" icon="event_busy" onClick={() => setCancelOpen(true)} data-testid="leave-cancel">
            {t('lvr.detail.cancel')}
          </Button>
        )}
      </div>

      <Modal open={cancelOpen} title={t('lvr.detail.cancel')} onClose={() => setCancelOpen(false)}>
        <div className="flex flex-col gap-4">
          {reasonRequired && <p className="text-sm text-ink-muted">{t('lvr.detail.cancelHint')}</p>}
          <Field label={t('lvr.detail.cancelReason')} htmlFor="leave-cancel-reason" required={reasonRequired} error={error ? t(error) : undefined}>
            <Textarea id="leave-cancel-reason" value={reason} maxLength={500} invalid={!!error} onChange={(e) => setReason(e.target.value)} data-testid="leave-cancel-reason" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              {t('common.back')}
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void confirmCancel()} data-testid="leave-cancel-confirm">
              {t('lvr.detail.cancelConfirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
