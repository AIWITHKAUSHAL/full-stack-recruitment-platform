import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@/types/api';
import { classNames } from '@/utils/format';

/**
 * Colour carries meaning here, so the label is always present too — colour is
 * never the only way a status is communicated.
 */
const STYLES: Record<ApplicationStatus, string> = {
  APPLIED: 'bg-slate-100 text-slate-700 ring-slate-200',
  SCREENING: 'bg-amber-50 text-amber-800 ring-amber-200',
  INTERVIEW: 'bg-brand-50 text-brand-700 ring-brand-200',
  SELECTED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200',
};

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        STYLES[status],
        className,
      )}
    >
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600',
        className,
      )}
    >
      {children}
    </span>
  );
}
