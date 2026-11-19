import { MaterialIcons } from '@expo/vector-icons';
import type { Locale } from '@hrm/shared';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

/** One choice in a single-select settings list (language, appearance). */
export function OptionRow({
  title, detail, leading, selected, onPress, testID, last = false,
}: {
  title: string;
  detail?: string;
  leading: ReactNode;
  selected: boolean;
  onPress: () => void;
  testID: string;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      accessibilityState={{ checked: selected }}
      testID={testID}
      onPress={onPress}
      className={`min-h-[68px] flex-row items-center gap-3 px-4 py-4 active:opacity-70 ${last ? '' : 'border-b border-line dark:border-night-line'}`}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{leading}</View>
      <View className="flex-1">
        <Text className="text-base font-medium text-ink dark:text-night-ink">{title}</Text>
        {detail ? <Text className="mt-1 text-sm text-ink-muted dark:text-night-muted">{detail}</Text> : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <MaterialIcons name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={24} color={selected ? '#3B5BFD' : '#94A3B8'} />
      </View>
    </Pressable>
  );
}

/** Rounded white list container, matching the profile menu. */
export function OptionList({ children }: { children: ReactNode }) {
  return <View className="overflow-hidden rounded-3xl bg-white shadow-sm dark:bg-night-surface">{children}</View>;
}

/** Flag shown next to each language. */
export const LANGUAGE_FLAGS: Record<Locale, string> = { lo: '🇱🇦', en: '🇬🇧' };
