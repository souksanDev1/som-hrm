import { Button } from './Button';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange(page: number): void;
  labels: { previous: string; next: string };
}

export function Pagination({ page, pageSize, total, onChange, labels }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label="pagination" className="flex items-center justify-between gap-2 pt-4 text-sm text-ink-muted">
      <span className="tabular-nums">
        {page} / {pages} · {total}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" icon="chevron_left" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <span className="sr-only sm:not-sr-only">{labels.previous}</span>
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          <span className="sr-only sm:not-sr-only">{labels.next}</span>
        </Button>
      </div>
    </nav>
  );
}
