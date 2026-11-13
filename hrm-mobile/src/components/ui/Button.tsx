import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

const container: Record<ButtonVariant, string> = {
  primary: 'bg-primary active:bg-primary-dark',
  secondary: 'border border-line bg-white active:bg-canvas dark:border-night-line dark:bg-night-surface',
  ghost: 'active:bg-primary-soft',
  danger: 'bg-danger active:opacity-90',
};
const label: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-ink dark:text-night-ink',
  ghost: 'text-primary',
  danger: 'text-white',
};

/** 48pt minimum touch target (field staff often wear gloves / use small phones). */
export function Button({ title, variant = 'primary', loading, fullWidth, disabled, className, ...rest }: ButtonProps & { className?: string }) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      className={`min-h-12 flex-row items-center justify-center rounded-sm px-4 ${container[variant]} ${fullWidth ? 'w-full' : ''} ${isDisabled ? 'opacity-60' : ''} ${className ?? ''}`}
      {...rest}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : '#1F5FD6'} /> : <Text className={`text-base font-semibold ${label[variant]}`}>{title}</Text>}
    </Pressable>
  );
}
