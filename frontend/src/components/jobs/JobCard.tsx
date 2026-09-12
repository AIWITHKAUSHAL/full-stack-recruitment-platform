import { Link } from 'react-router-dom';
import { LinkButton } from '@/components/common/Button';
import { Tag } from '@/components/common/StatusBadge';
import { EMPLOYMENT_TYPE_LABELS, type JobSummary } from '@/types/api';
import { relativeDate } from '@/utils/format';

/**
 * Reusable summary card. It renders whatever the API returns — no job data is
 * ever hardcoded in a component (CLAUDE.md §11).
 */
export function JobCard({ job }: { job: JobSummary }) {
  return (
    <article className="card flex h-full flex-col p-5 transition hover:border-brand-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-slate-900">
          <Link to={`/jobs/${job.id}`} className="hover:text-brand-700 hover:underline">
            {job.title}
          </Link>
        </h3>
        <span className="shrink-0 font-mono text-[11px] text-slate-400">{job.job_code}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Tag className="bg-brand-50 text-brand-700">{job.department}</Tag>
        <Tag>{job.location}</Tag>
        <Tag>{EMPLOYMENT_TYPE_LABELS[job.employment_type]}</Tag>
      </div>

      <p className="mt-3.5 flex-1 text-sm leading-relaxed text-slate-600">{job.summary}</p>

      <dl className="mt-4 flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <dt className="sr-only">Experience required</dt>
          <dd>
            <span aria-hidden="true">⏱ </span>
            {job.experience_required}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Posted</dt>
          <dd>{relativeDate(job.created_at)}</dd>
        </div>
      </dl>

      <div className="mt-5 flex gap-2">
        <LinkButton to={`/jobs/${job.id}`} variant="secondary" size="sm">
          View details
        </LinkButton>
        <LinkButton to={`/jobs/${job.id}/apply`} size="sm">
          Apply
        </LinkButton>
      </div>
    </article>
  );
}
