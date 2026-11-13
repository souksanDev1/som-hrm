import { cn } from '@/lib/cn';

export interface IconProps {
  /** Material Symbols Outlined ligature name, e.g. "group". */
  name: string;
  className?: string;
  /** Accessible label; when omitted the icon is decorative. */
  label?: string;
}

export function Icon({ name, className, label }: IconProps) {
  return (
    <span
      className={cn('material-symbols-outlined select-none leading-none', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  );
}
