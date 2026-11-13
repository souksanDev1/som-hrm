import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  testID?: string;
}

/**
 * Safe-area aware page container. Content is capped at 640pt and centred so
 * layouts stay readable on tablets and in landscape.
 */
export function Screen({ children, scroll = true, edges = ['top'], testID }: ScreenProps) {
  const body = <View className="w-full max-w-[640px] self-center flex-1 px-4 py-4">{children}</View>;
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-canvas dark:bg-night-canvas" testID={testID}>
      {scroll ? (
        <ScrollView contentContainerClassName="flex-grow" keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
