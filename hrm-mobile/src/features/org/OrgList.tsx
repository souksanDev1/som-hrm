import type { OrgChartNode } from '@hrm/shared';
import { memo, useMemo, type ReactElement } from 'react';
import { FlatList, Text, View } from 'react-native';

interface Row {
  node: OrgChartNode;
  depth: number;
}

/** Flatten the tree depth-first so a virtualised list can render large orgs on low-end phones. */
export const flattenOrg = (roots: readonly OrgChartNode[], depth = 0): Row[] =>
  roots.flatMap((node) => [{ node, depth }, ...flattenOrg(node.children, depth + 1)]);

const ROW_HEIGHT = 57;

const OrgRow = memo(function OrgRow({ item }: { item: Row }) {
  return (
    <View
      className="flex-row items-center gap-3 border-b border-line py-2.5 dark:border-night-line"
      style={{ paddingLeft: Math.min(item.depth, 6) * 16, height: ROW_HEIGHT }}
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-soft">
        <Text className="text-sm font-semibold text-primary">{item.node.name.slice(0, 1)}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-ink dark:text-night-ink" testID="org-node" numberOfLines={1}>
          {item.node.name}
        </Text>
        <Text className="text-xs text-ink-muted" numberOfLines={1}>
          {[item.node.position, item.node.department].filter(Boolean).join(' · ') || item.node.employeeCode}
        </Text>
      </View>
    </View>
  );
});

export interface OrgListProps {
  roots: readonly OrgChartNode[];
  /** Rendered above the rows inside the same scroll view (titles, filters). */
  header?: ReactElement;
}

/**
 * Virtualised org list: the FlatList is the screen's scroll container (do not nest it in a
 * ScrollView), with fixed row heights so only visible rows are mounted.
 */
export function OrgList({ roots, header }: OrgListProps) {
  const rows = useMemo(() => flattenOrg(roots), [roots]);
  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.node.id}
      testID="org-list"
      ListHeaderComponent={header}
      renderItem={({ item }) => <OrgRow item={item} />}
      getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
      initialNumToRender={20}
      windowSize={7}
      removeClippedSubviews
    />
  );
}
