import { MaterialIcons } from '@expo/vector-icons';
import { nameInitial, type OrgStructureMember, type OrgStructureNode } from '@hrm/shared';
import { memo, useCallback, useMemo, useState, type ReactElement } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Badge } from '@/components/ui';
import { useT } from '@/lib/i18n';

export type StructureRow =
  | { type: 'dept'; node: OrgStructureNode; depth: number }
  | { type: 'person'; member: OrgStructureMember; depth: number; isHead: boolean };

/** Levels 0 and 1 (Chairman, CEO) start expanded. */
const OPEN_DEPTH = 2;
// Heights include the bottom gap, so getItemLayout stays exact.
const DEPT_HEIGHT = 88;
const PERSON_HEIGHT = 72;
const INDENT = 14;
const MAX_INDENT_LEVELS = 6;

const rowHeight = (r: StructureRow) => (r.type === 'dept' ? DEPT_HEIGHT : PERSON_HEIGHT);
const rowKey = (r: StructureRow) => (r.type === 'dept' ? `dept:${r.node.id}` : `person:${r.member.id}`);

/** Depth-first rows; an expanded department shows its head, then members, then sub-departments. */
export const flattenStructure = (roots: readonly OrgStructureNode[], expanded: ReadonlySet<string>, depth = 0): StructureRow[] =>
  roots.flatMap((node) => {
    const row: StructureRow = { type: 'dept', node, depth };
    if (!expanded.has(node.id)) return [row];
    const people: StructureRow[] = [
      ...(node.head ? [{ type: 'person' as const, member: node.head, depth: depth + 1, isHead: true }] : []),
      ...node.members.map((member) => ({ type: 'person' as const, member, depth: depth + 1, isHead: false })),
    ];
    return [row, ...people, ...flattenStructure(node.children, expanded, depth + 1)];
  });

const initiallyExpanded = (roots: readonly OrgStructureNode[], depth = 0, out = new Set<string>()) => {
  if (depth >= OPEN_DEPTH) return out;
  roots.forEach((n) => {
    out.add(n.id);
    initiallyExpanded(n.children, depth + 1, out);
  });
  return out;
};

const indent = (depth: number) => Math.min(depth, MAX_INDENT_LEVELS) * INDENT;

const DeptRow = memo(function DeptRow({ node, depth, open, onToggle }: { node: OrgStructureNode; depth: number; open: boolean; onToggle(id: string): void }) {
  const t = useT();
  const name = node.kind === 'unassigned' ? t('org.structure.unassigned') : node.name;
  return (
    <View style={{ paddingLeft: indent(depth), height: DEPT_HEIGHT, paddingBottom: 10 }}>
      <Pressable
        testID={`org-dept-${node.id}`}
        onPress={() => onToggle(node.id)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${name}, ${node.head?.name ?? ''}, ${node.employeeCount} ${t('org.structure.employees')}`}
        className="flex-1 flex-row items-center gap-3 rounded-2xl bg-[#26308f] px-3"
      >
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-white/15">
          {node.head && node.kind !== 'unassigned' ? (
            <Text className="text-lg font-semibold text-white">{nameInitial(node.head.name)}</Text>
          ) : (
            <MaterialIcons name={node.kind === 'unassigned' ? 'person-off' : 'apartment'} size={22} color="#fff" />
          )}
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-white" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-xs text-white/80" numberOfLines={1}>
            {node.head?.name ?? ' '}
          </Text>
          <View className="mt-1 flex-row gap-3">
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="account-tree" size={14} color="#fff" />
              <Text className="text-xs text-white">{node.children.length}</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="group" size={14} color="#fff" />
              <Text className="text-xs text-white">{node.employeeCount}</Text>
            </View>
          </View>
        </View>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={24} color="#fff" />
      </Pressable>
    </View>
  );
});

const PersonRow = memo(function PersonRow({ member, depth, isHead }: { member: OrgStructureMember; depth: number; isHead: boolean }) {
  const t = useT();
  return (
    <View style={{ paddingLeft: indent(depth), height: PERSON_HEIGHT, paddingBottom: 8 }}>
      <View
        testID={`org-person-${member.id}`}
        accessible
        accessibilityLabel={`${member.name}, ${member.position ?? member.employeeCode}${isHead ? `, ${t('org.structure.manager')}` : ''}`}
        className="flex-1 flex-row items-center gap-3 rounded-2xl bg-white px-3 dark:bg-night-surface"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-soft">
          <Text className="text-sm font-semibold text-primary">{nameInitial(member.name)}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink dark:text-night-ink" numberOfLines={1}>
            {member.name}
          </Text>
          <Text className="text-xs text-ink-muted dark:text-night-muted" numberOfLines={1}>
            {member.position ?? member.employeeCode}
          </Text>
        </View>
        {isHead && <Badge label={t('org.structure.manager')} tone="success" />}
      </View>
    </View>
  );
});

export interface OrgStructureListProps {
  roots: readonly OrgStructureNode[];
  /** Rendered above the rows inside the same scroll view. */
  header?: ReactElement;
}

/**
 * Department structure as an expandable, virtualised list (Chairman → CEO → departments → staff).
 * The FlatList is the screen's scroll container; do not nest it in a ScrollView.
 */
export function OrgStructureList({ roots, header }: OrgStructureListProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => initiallyExpanded(roots));
  const toggle = useCallback(
    (id: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  const rows = useMemo(() => flattenStructure(roots, expanded), [roots, expanded]);
  const offsets = useMemo(() => {
    const out: number[] = [];
    rows.reduce((sum, r) => (out.push(sum), sum + rowHeight(r)), 0);
    return out;
  }, [rows]);
  return (
    <FlatList
      data={rows}
      keyExtractor={rowKey}
      testID="org-list"
      ListHeaderComponent={header}
      renderItem={({ item }) =>
        item.type === 'dept' ? (
          <DeptRow node={item.node} depth={item.depth} open={expanded.has(item.node.id)} onToggle={toggle} />
        ) : (
          <PersonRow member={item.member} depth={item.depth} isHead={item.isHead} />
        )
      }
      getItemLayout={(_, index) => ({ length: rows[index] ? rowHeight(rows[index]) : 0, offset: offsets[index] ?? 0, index })}
      initialNumToRender={20}
      windowSize={7}
      removeClippedSubviews
    />
  );
}
