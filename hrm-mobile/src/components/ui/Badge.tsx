import { Text, View } from 'react-native';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const tones: Record<BadgeTone, [string, string]> = {
  neutral: ['bg-canvas border-line', 'text-ink-muted'],
  primary: ['bg-primary-soft border-primary/20', 'text-primary'],
  success: ['bg-success-soft border-success/20', 'text-success'],
  warning: ['bg-warning-soft border-warning/20', 'text-warning'],
  danger: ['bg-danger-soft border-danger/20', 'text-danger'],
};

export function Badge({ label, tone = 'neutral', testID }: { label: string; tone?: BadgeTone; testID?: string }) {
  const [box, text] = tones[tone];
  return (
    <View testID={testID} className={`self-start rounded-full border px-2 py-0.5 ${box}`}>
      <Text className={`text-xs font-medium ${text}`}>{label}</Text>
    </View>
  );
}
