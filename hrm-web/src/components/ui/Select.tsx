import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { controlClass } from './Input';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends ComponentProps<'select'> {
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}

export function Select({ options, placeholder, invalid, className, id, ...rest }: SelectProps) {
  return (
    <select
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && id ? `${id}-error` : undefined}
      className={cn(controlClass(invalid), 'pr-8', className)}
      {...rest}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
