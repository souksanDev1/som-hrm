import { cn } from '@/lib/cn';

export interface ShiftSwatchProps {
  shift: { name: string; code?: string | null; color?: string | null };
  /** Dashed outline: the shift comes from the work schedule, not the roster. */
  dashed?: boolean;
  className?: string;
}

/** Small coloured chip with the shift's short code (or initial), used in lists, the roster and reports. */
export function ShiftSwatch({ shift, dashed, className }: ShiftSwatchProps) {
  const label = shift.code || shift.name.slice(0, 2);
  return (
    <span
      title={shift.name}
      className={cn(
        'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1 text-xs font-semibold text-white',
        dashed && 'border border-dashed border-ink-muted opacity-80',
        !shift.color && 'bg-primary',
        className,
      )}
      style={shift.color ? { backgroundColor: shift.color } : undefined}
    >
      {label}
    </span>
  );
}
