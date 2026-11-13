import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useT } from '@/lib/i18n';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  required?: boolean;
}

/** Labelled text input. With `secureTextEntry` it adds a show/hide toggle (testID `${testID}-toggle`). */
export function TextField({ label, error, required, testID, secureTextEntry, ...rest }: TextFieldProps) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const toggleLabel = t(revealed ? 'auth.hidePassword' : 'auth.showPassword');

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-ink dark:text-night-ink">
        {label}
        {required ? <Text className="text-danger"> *</Text> : null}
      </Text>
      <View className="justify-center">
        <TextInput
          accessibilityLabel={label}
          testID={testID}
          placeholderTextColor="#98A2B3"
          secureTextEntry={secureTextEntry && !revealed}
          className={`min-h-12 rounded-sm border bg-white px-3 text-base text-ink dark:bg-night-surface dark:text-night-ink ${secureTextEntry ? 'pr-12' : ''} ${error ? 'border-danger' : 'border-line dark:border-night-line'}`}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toggleLabel}
            accessibilityState={{ checked: revealed }}
            hitSlop={8}
            onPress={() => setRevealed((v) => !v)}
            testID={testID ? `${testID}-toggle` : undefined}
            className="absolute right-0 h-12 w-12 items-center justify-center"
          >
            <MaterialIcons name={revealed ? 'visibility-off' : 'visibility'} size={22} color="#667085" />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-xs text-danger" testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
