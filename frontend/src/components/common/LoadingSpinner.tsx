import { classNames } from '@/utils/format';

export function LoadingSpinner({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={classNames('flex flex-col items-center justify-center gap-3 py-16', className)} role="status">
      <svg className="h-8 w-8 animate-spin text-brand-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

/** Card-shaped placeholder used while the job grid loads. */
export function JobCardSkeleton() {
  return (
    <div className="card animate-pulse p-5">
      <div className="h-5 w-2/3 rounded bg-slate-200" />
      <div className="mt-3 flex gap-2">
        <div className="h-5 w-20 rounded-full bg-slate-100" />
        <div className="h-5 w-24 rounded-full bg-slate-100" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-5/6 rounded bg-slate-100" />
      </div>
      <div className="mt-5 h-9 w-28 rounded-lg bg-slate-100" />
    </div>
  );
}
