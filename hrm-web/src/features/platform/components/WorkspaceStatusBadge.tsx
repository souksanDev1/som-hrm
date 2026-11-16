import type { WorkspaceStatus } from '@hrm/shared';
import { Badge } from '@/components/ui';
import { useT } from '@/lib/i18n';

export function WorkspaceStatusBadge({ status }: { status: WorkspaceStatus }) {
  const t = useT();
  return (
    <span data-testid="workspace-status" data-status={status}>
      <Badge tone={status === 'ACTIVE' ? 'success' : 'danger'}>{t(`platform.workspace.status.${status}`)}</Badge>
    </span>
  );
}
