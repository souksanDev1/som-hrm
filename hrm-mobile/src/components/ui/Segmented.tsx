import { Pressable, Text, View } from 'react-native';

export interface SegmentedProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string; testID?: string }[];
  onChange(value: T): void;
}

export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <View accessibilityRole="tablist" className="flex-row rounded-sm bg-line/60 p-1 dark:bg-night-line">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            testID={o.testID}
            onPress={() => onChange(o.value)}
            className={`min-h-10 flex-1 items-center justify-center rounded-sm ${active ? 'bg-white dark:bg-night-surface' : ''}`}
          >
            <Text className={`text-sm font-medium ${active ? 'text-primary' : 'text-ink-muted'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
