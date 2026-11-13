import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-ink-muted border-line',
  primary: 'bg-primary-soft text-primary border-primary/20',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}
