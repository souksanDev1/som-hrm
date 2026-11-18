import { MaterialIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useT } from '@/lib/i18n';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-'.split('');

export interface KeypadProps {
  value: string;
  onChange(value: string): void;
  maxLength: number;
  /** OK pressed (or `autoSubmit` and the value reached `maxLength`). */
  onSubmit(value: string): void;
  /** Show dots instead of the typed characters (PIN). */
  masked?: boolean;
  /** Offer an A–Z page too (employee codes such as "E003"). */
  allowLetters?: boolean;
  autoSubmit?: boolean;
  testID: string;
}

function Key({ label, onPress, testID, children }: { label: string; onPress(): void; testID: string; children?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      className={`m-1 h-16 items-center justify-center rounded-md bg-white active:bg-primary-soft dark:bg-night-surface flex-1`}
    >
      {children ?? <Text className="text-2xl font-semibold text-ink dark:text-night-ink">{label}</Text>}
    </Pressable>
  );
}

/**
 * Large on-screen keypad for the shared kiosk (FR-ATT-03.2): no system keyboard, gloved-finger sized keys. Digits
 * by default; `allowLetters` adds an A–Z page for employee codes.
 */
export function Keypad({ value, onChange, maxLength, onSubmit, masked, allowLetters, autoSubmit, testID }: KeypadProps) {
  const t = useT();
  const [letters, setLetters] = useState(false);
  const press = (ch: string) => {
    if (value.length >= maxLength) return;
    const next = value + ch;
    onChange(next);
    if (autoSubmit && next.length === maxLength) onSubmit(next);
  };
  const keys = letters ? LETTERS : DIGITS;

  return (
    <View className="w-full gap-2" testID={testID}>
      <View className="min-h-16 items-center justify-center rounded-md border border-line bg-white px-4 dark:border-night-line dark:bg-night-surface">
        <Text className="text-3xl font-semibold tracking-widest text-ink dark:text-night-ink" testID={`${testID}-display`}>
          {masked ? '•'.repeat(value.length) : value}
        </Text>
      </View>
      <View className="flex-row flex-wrap">
        {keys.map((k) => (
          // flex-row: the key's flex-1 must stretch the width; in a column it would collapse the height to 0.
          <View key={k} className={`flex-row ${letters ? 'w-1/6' : 'w-1/3'}`}>
            <Key label={k} onPress={() => press(k)} testID={`${testID}-key-${k}`} />
          </View>
        ))}
      </View>
      <View className="flex-row">
        {allowLetters ? (
          <Key label={letters ? '123' : 'ABC'} onPress={() => setLetters((v) => !v)} testID={`${testID}-toggle`} />
        ) : (
          <Key label={t('kiosk.keypad.clear')} onPress={() => onChange('')} testID={`${testID}-clear`}>
            <Text className="text-base font-semibold text-ink-muted">{t('kiosk.keypad.clear')}</Text>
          </Key>
        )}
        {letters ? <View className="flex-1" /> : <Key label="0" onPress={() => press('0')} testID={`${testID}-key-0`} />}
        <Key label="⌫" onPress={() => onChange(value.slice(0, -1))} testID={`${testID}-backspace`}>
          <MaterialIcons name="backspace" size={26} color="#667085" />
        </Key>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !value }}
        disabled={!value}
        testID={`${testID}-ok`}
        onPress={() => onSubmit(value)}
        className={`m-1 h-16 items-center justify-center rounded-md bg-primary active:bg-primary-dark ${value ? '' : 'opacity-50'}`}
      >
        <Text className="text-xl font-semibold text-white">{t('kiosk.keypad.ok')}</Text>
      </Pressable>
    </View>
  );
}
