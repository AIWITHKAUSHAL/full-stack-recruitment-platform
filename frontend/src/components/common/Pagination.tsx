import { Button } from './Button';

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pages, total, pageSize, onChange }: PaginationProps) {
  if (pages <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="mt-8 flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-sm text-slate-600">
        Showing <span className="font-medium text-slate-900">{first}</span>–
        <span className="font-medium text-slate-900">{last}</span> of{' '}
        <span className="font-medium text-slate-900">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
          Previous
        </Button>
        <span className="px-2 text-sm text-slate-600" aria-current="page">
          Page {page} of {pages}
        </span>
        <Button variant="secondary" size="sm" onClick={() => onChange(page + 1)} disabled={page >= pages}>
          Next
        </Button>
      </div>
    </nav>
  );
}
