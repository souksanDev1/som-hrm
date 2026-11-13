import type { ComponentProps } from 'react';

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: string;
}

export function Checkbox({ label, id, ...rest }: CheckboxProps) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-night-ink">
      <input id={id} type="checkbox" className="h-4 w-4 rounded border-line text-primary focus:ring-primary" {...rest} />
      {label}
    </label>
  );
}
