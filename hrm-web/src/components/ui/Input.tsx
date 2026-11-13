import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends ComponentProps<'input'> {
  invalid?: boolean;
}

export const controlClass = (invalid?: boolean) =>
  cn(
    'h-10 w-full rounded-sm border bg-white px-3 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-canvas dark:bg-night-surface dark:text-night-ink',
    invalid ? 'border-danger' : 'border-line focus:border-primary dark:border-night-line',
  );

export function Input({ invalid, className, id, ...rest }: InputProps) {
  return (
    <input
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && id ? `${id}-error` : undefined}
      className={cn(controlClass(invalid), 'tabular-nums', className)}
      {...rest}
    />
  );
}
