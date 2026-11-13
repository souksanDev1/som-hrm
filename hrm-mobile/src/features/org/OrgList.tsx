import type { OrgChartNode } from '@hrm/shared';
import { FlatList, Text, View } from 'react-native';

interface Row {
  node: OrgChartNode;
  depth: number;
}

/** Flatten the tree depth-first so a virtualised list can render large orgs on low-end phones. */
export const flattenOrg = (roots: readonly OrgChartNode[], depth = 0): Row[] =>
  roots.flatMap((node) => [{ node, depth }, ...flattenOrg(node.children, depth + 1)]);

export function OrgList({ roots }: { roots: readonly OrgChartNode[] }) {
  const rows = flattenOrg(roots);
  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.node.id}
      testID="org-list"
      scrollEnabled={false}
      renderItem={({ item }) => (
        <View className="flex-row items-center gap-3 border-b border-line py-2.5 dark:border-night-line" style={{ paddingLeft: Math.min(item.depth, 6) * 16 }}>
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-soft">
            <Text className="text-sm font-semibold text-primary">{item.node.name.slice(0, 1)}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium text-ink dark:text-night-ink" testID="org-node">{item.node.name}</Text>
            <Text className="text-xs text-ink-muted">{[item.node.position, item.node.department].filter(Boolean).join(' · ') || item.node.employeeCode}</Text>
          </View>
        </View>
      )}
    />
  );
}
