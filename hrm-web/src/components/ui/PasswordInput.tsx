'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { Icon } from './Icon';
import { Input, type InputProps } from './Input';

export type PasswordInputProps = Omit<InputProps, 'type'>;

/** Password/PIN input with a show/hide toggle. Accepts the same props as `Input`. */
export function PasswordInput({ className, ...rest }: PasswordInputProps) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative">
      <Input type={revealed ? 'text' : 'password'} className={cn('pr-10', className)} {...rest} />
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-label={t(revealed ? 'auth.hidePassword' : 'auth.showPassword')}
        aria-pressed={revealed}
        data-testid={rest.id ? `${rest.id}-toggle` : undefined}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-sm text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:text-night-ink"
      >
        <Icon name={revealed ? 'visibility_off' : 'visibility'} className="text-xl" />
      </button>
    </div>
  );
}
