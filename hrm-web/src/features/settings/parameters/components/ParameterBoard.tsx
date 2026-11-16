'use client';
import type { ParameterView } from '@hrm/shared';
import { useState } from 'react';
import { Modal } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { ParameterCard } from './ParameterCard';
import { ScheduleChangeForm, type ScheduleChangeInput } from './ScheduleChangeForm';

export interface ParameterBoardProps {
  items: readonly ParameterView[];
  canEdit: boolean;
  dateMode?: 'date' | 'datetime';
  /** Default + minimum effective date for the form (today in the workspace / now). */
  defaultEffectiveFrom: string;
  formatEffective?(value: string): string;
  onSubmit(key: string, input: ScheduleChangeInput): Promise<unknown>;
}

/** Grid of parameter cards plus the "schedule change" dialog. Shared by tenant and platform screens. */
export function ParameterBoard({ items, canEdit, dateMode = 'date', defaultEffectiveFrom, formatEffective, onSubmit }: ParameterBoardProps) {
  const t = useT();
  const [editing, setEditing] = useState<ParameterView | null>(null);
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((p) => (
          <ParameterCard key={p.key} parameter={p} canEdit={canEdit} onSchedule={setEditing} formatEffective={formatEffective} />
        ))}
      </div>
      <Modal open={!!editing} title={editing ? t(editing.labelKey) : ''} onClose={() => setEditing(null)}>
        {editing && (
          <ScheduleChangeForm
            key={editing.key}
            parameter={editing}
            dateMode={dateMode}
            defaultEffectiveFrom={defaultEffectiveFrom}
            minEffectiveFrom={defaultEffectiveFrom}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              await onSubmit(editing.key, input);
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}
