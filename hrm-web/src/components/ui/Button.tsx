import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: string;
  fullWidth?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark disabled:bg-primary/50',
  secondary: 'border border-line bg-white text-ink hover:bg-canvas dark:border-night-line dark:bg-night-surface dark:text-night-ink',
  ghost: 'text-ink hover:bg-primary-soft dark:text-night-ink dark:hover:bg-night-line',
  danger: 'bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50',
};
const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon ? <Icon name={icon} className="text-[18px]" /> : null}
      {children}
    </button>
  );
}
