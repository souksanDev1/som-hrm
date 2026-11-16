'use client';
import { useId, useState, type ChangeEvent } from 'react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

export interface FileUploadProps {
  /** `accept` attribute, e.g. DOCUMENT_FILE_ACCEPT from @hrm/shared. */
  accept?: string;
  /** Early client-side size check; the API still enforces its own limit. */
  maxBytes?: number;
  /** Called with the chosen file once it passes the size check. */
  onSelect?(file: File): void;
  /** Upload immediately after selection; rejections are shown as the error (ApiError codes are translated). */
  onUpload?(file: File): Promise<unknown>;
  disabled?: boolean;
  /** Button label; defaults to "Choose file". */
  label?: string;
  /** Hint under the button (e.g. allowed types). */
  hint?: string;
  /** External error message (already translated). */
  error?: string;
  id?: string;
  className?: string;
  'data-testid'?: string;
}

const errorCode = (err: unknown) => (err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'unknown');

/** Accessible file picker styled as a button, with size pre-check, upload progress and error display. */
export function FileUpload({ accept, maxBytes, onSelect, onUpload, disabled, label, hint, error, id, className, ...rest }: FileUploadProps) {
  const t = useT();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = error ?? localError;

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so choosing the same file again still fires `change`.
    e.target.value = '';
    if (!file) return;
    setLocalError(null);
    if (maxBytes !== undefined && file.size > maxBytes) {
      setLocalError(t('error.file_too_large'));
      return;
    }
    onSelect?.(file);
    if (!onUpload) return;
    setBusy(true);
    try {
      await onUpload(file);
    } catch (err) {
      setLocalError(t(errorCode(err)));
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = disabled || busy;
  const text = label ?? t('file.choose');
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        htmlFor={inputId}
        aria-disabled={isDisabled || undefined}
        className={cn(
          'inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-sm border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-canvas',
          'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
          'dark:border-night-line dark:bg-night-surface dark:text-night-ink',
          isDisabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {busy ? <Spinner className="h-4 w-4" /> : <Icon name="upload_file" className="text-[18px]" />}
        {text}
        <input
          id={inputId}
          type="file"
          aria-label={text}
          accept={accept}
          disabled={isDisabled}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? `${inputId}-error` : undefined}
          className="sr-only"
          onChange={(e) => void handleChange(e)}
          data-testid={rest['data-testid']}
        />
      </label>
      {shownError ? (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-danger">
          {shownError}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
