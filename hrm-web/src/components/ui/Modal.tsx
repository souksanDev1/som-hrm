'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Accessible dialog built on the native <dialog> element (focus trap + Esc for free). */
export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className="w-[calc(100%-2rem)] max-w-lg rounded-lg border border-line p-0 backdrop:bg-ink/40 dark:border-night-line dark:bg-night-surface"
    >
      {open && (
        <div className="flex flex-col">
          <header className="flex items-center justify-between border-b border-line px-5 py-4 dark:border-night-line">
            <h2 id="modal-title" className="text-base font-semibold text-ink dark:text-night-ink">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-muted hover:bg-canvas">
              <Icon name="close" />
            </button>
          </header>
          <div className="px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3 dark:border-night-line">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
