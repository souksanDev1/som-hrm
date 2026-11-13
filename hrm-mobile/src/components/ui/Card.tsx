import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export function Card({ title, right, children, testID }: { title?: string; right?: ReactNode; children: ReactNode; testID?: string }) {
  return (
    <View testID={testID} className="mb-4 rounded-md border border-line bg-white p-4 dark:border-night-line dark:bg-night-surface">
      {title || right ? (
        <View className="mb-3 flex-row items-center justify-between">
          {title ? <Text className="text-base font-semibold text-ink dark:text-night-ink">{title}</Text> : <View />}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function InfoRow({ label, value, testID }: { label: string; value?: string | null; testID?: string }) {
  return (
    <View className="flex-row justify-between gap-4 border-b border-line py-2.5 last:border-b-0 dark:border-night-line">
      <Text className="flex-1 text-sm text-ink-muted">{label}</Text>
      <Text testID={testID} className="flex-1 text-right text-sm text-ink dark:text-night-ink" style={{ fontVariant: ['tabular-nums'] }}>
        {value || '—'}
      </Text>
    </View>
  );
}
