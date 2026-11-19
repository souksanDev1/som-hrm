import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';
import { useT } from '@/lib/i18n';

/** Left-aligned back link with an arrow icon, used at the top of stacked screens. */
export function BackButton({ onPress, label, testID }: { onPress: () => void; label?: string; testID?: string }) {
  const t = useT();
  const text = label ?? t('common.back');
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={onPress}
      hitSlop={8}
      className="mb-2 min-h-11 flex-row items-center gap-1 self-start rounded-full pr-3 active:opacity-60"
    >
      <MaterialIcons name="arrow-back" size={22} color="#3B5BFD" />
      <Text className="text-base font-semibold text-primary">{text}</Text>
    </Pressable>
  );
}
