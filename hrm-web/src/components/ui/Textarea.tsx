import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { controlClass } from './Input';

export interface TextareaProps extends ComponentProps<'textarea'> {
  invalid?: boolean;
}

/** Multi-line text input with the same look and error wiring as `Input`. */
export function Textarea({ invalid, className, id, rows = 3, ...rest }: TextareaProps) {
  return (
    <textarea
      id={id}
      rows={rows}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && id ? `${id}-error` : undefined}
      className={cn(controlClass(invalid), 'h-auto py-2', className)}
      {...rest}
    />
  );
}
