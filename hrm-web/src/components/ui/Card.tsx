import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends Omit<ComponentProps<'section'>, 'title'> {
  title?: ReactNode;
  actions?: ReactNode;
}

export function Card({ title, actions, className, children, ...rest }: CardProps) {
  return (
    <section
      className={cn('rounded-md border border-line bg-white p-4 dark:border-night-line dark:bg-night-surface sm:p-5', className)}
      {...rest}
    >
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-ink dark:text-night-ink">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
