import { MaterialIcons } from '@expo/vector-icons';
import type { OrgChartNode } from '@hrm/shared';
import { memo, useMemo, type ReactElement } from 'react';
import { FlatList, Text, View } from 'react-native';
import { usePrefsStore } from '@/lib/i18n';

interface Row {
  node: OrgChartNode;
  depth: number;
}

/** Flatten the tree depth-first so a virtualised list can render large orgs on low-end phones. */
export const flattenOrg = (roots: readonly OrgChartNode[], depth = 0): Row[] =>
  roots.flatMap((node) => [{ node, depth }, ...flattenOrg(node.children, depth + 1)]);

// Includes the 12pt gap so getItemLayout stays exact at every hierarchy depth.
const ROW_HEIGHT = 96;

const OrgRow = memo(function OrgRow({ item }: { item: Row }) {
  const locale = usePrefsStore((s) => s.locale);
  const subtitle = [item.node.position, item.node.department].filter(Boolean).join(' · ') || item.node.employeeCode;
  const levelLabel = locale === 'lo' ? 'ລະດັບໃນອົງກອນ' : 'Organization level';
  return (
    <View
      testID={`org-row-${item.node.id}`}
      style={{ paddingLeft: Math.min(item.depth, 6) * 12, height: ROW_HEIGHT, paddingBottom: 12 }}
    >
      <View
        accessible
        accessibilityLabel={`${item.node.name}, ${subtitle}, ${levelLabel} ${item.depth + 1}`}
        className="flex-1 flex-row items-center gap-3 rounded-3xl bg-white px-4 dark:bg-night-surface"
      >
        <View
          className="h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-night-line"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <MaterialIcons name="person-outline" size={28} color="#94A3B8" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink dark:text-night-ink" testID="org-node" numberOfLines={1}>
            {item.node.name}
          </Text>
          <Text className="mt-1 text-sm text-ink-muted dark:text-night-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
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
