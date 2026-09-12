import { StatusBadge } from '@/components/common/StatusBadge';
import {
  APPLICATION_STATUS_HELP,
  APPLICATION_STATUS_LABELS,
  PIPELINE_ORDER,
  type ApplicationTracking,
} from '@/types/api';
import { classNames, formatDateTime } from '@/utils/format';

/**
 * Candidate-facing status view. It renders only what the tracking endpoint
 * returns — there is deliberately nothing here about recruiter notes or other
 * candidates, because the API never sends them (project rule R4).
 */
export function TrackingResult({ result }: { result: ApplicationTracking }) {
  const rejected = result.status === 'REJECTED';
  const currentIndex = PIPELINE_ORDER.indexOf(result.status);

  return (
    <div className="card animate-fade-in p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-slate-400">{result.application_code}</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{result.job_title}</h2>
          <p className="mt-1 font-mono text-xs text-slate-400">{result.job_code}</p>
        </div>
        <StatusBadge status={result.status} className="text-sm" />
      </div>

      <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
        {APPLICATION_STATUS_HELP[result.status]}
      </p>

      {!rejected && (
        <ol className="mt-7 flex flex-col gap-0 sm:flex-row sm:items-center" aria-label="Hiring progress">
          {PIPELINE_ORDER.map((stage, index) => {
            const reached = index <= currentIndex;
            const isCurrent = index === currentIndex;
            return (
              <li key={stage} className="flex flex-1 items-center gap-3 sm:flex-col sm:gap-2 sm:text-center">
                <span
                  aria-hidden="true"
                  className={classNames(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-2',
                    reached ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-400 ring-slate-200',
                  )}
                >
                  {reached ? '✓' : index + 1}
                </span>
                <span
                  className={classNames(
                    'py-2 text-sm sm:py-0 sm:text-xs',
                    isCurrent ? 'font-semibold text-brand-700' : reached ? 'text-slate-700' : 'text-slate-400',
                  )}
                >
                  {APPLICATION_STATUS_LABELS[stage]}
                  {isCurrent && <span className="sr-only"> (current stage)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <dl className="mt-7 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Submitted</dt>
          <dd className="mt-1 text-sm text-slate-700">{formatDateTime(result.submitted_at)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Last updated</dt>
          <dd className="mt-1 text-sm text-slate-700">{formatDateTime(result.last_updated_at)}</dd>
        </div>
      </dl>
    </div>
  );
}
