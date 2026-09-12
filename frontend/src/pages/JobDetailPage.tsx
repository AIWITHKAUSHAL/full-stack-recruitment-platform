import { Link, useParams } from 'react-router-dom';
import { jobsApi } from '@/api/jobs';
import { LinkButton } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Tag } from '@/components/common/StatusBadge';
import { useAsync } from '@/hooks/useAsync';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { EMPLOYMENT_TYPE_LABELS } from '@/types/api';
import { formatDate, toLines, toSkillList } from '@/utils/format';

export default function JobDetailPage() {
  const { jobId } = useParams();
  const id = Number(jobId);
  const { data: job, loading, error, reload } = useAsync(() => jobsApi.detail(id), [id]);

  useDocumentTitle(job?.title);

  if (loading) return <LoadingSpinner label="Loading role…" />;

  // The backend returns 404 for an inactive job too, so a closed role never
  // shows its detail page publicly.
  if (error?.code === 'JOB_NOT_FOUND') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon="📭"
          title="This role is no longer available"
          description="It may have been filled or closed. Have a look at the roles that are still open."
          action={<LinkButton to="/jobs">Browse open roles</LinkButton>}
        />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <ErrorMessage error={error} onRetry={reload} />
      </div>
    );
  }

  const responsibilities = toLines(job.responsibilities);
  const skills = toSkillList(job.skills);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-500">
        <Link to="/jobs" className="hover:text-brand-700 hover:underline">
          Open roles
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="text-slate-700">{job.title}</span>
      </nav>

      <header className="card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{job.title}</h1>
            <p className="mt-2 font-mono text-xs text-slate-400">{job.job_code}</p>
          </div>
          <LinkButton to={`/jobs/${job.id}/apply`} size="lg">
            Apply now
          </LinkButton>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-4">
          {[
            { label: 'Department', value: job.department },
            { label: 'Location', value: job.location },
            { label: 'Employment type', value: EMPLOYMENT_TYPE_LABELS[job.employment_type] },
            { label: 'Experience', value: job.experience_required },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{item.label}</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{item.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-6 space-y-6">
        <section className="card p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900">About the role</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{job.description}</p>
        </section>

        {responsibilities.length > 0 && (
          <section className="card p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900">What you will do</h2>
            <ul className="mt-3 space-y-2">
              {responsibilities.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {skills.length > 0 && (
          <section className="card p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900">Skills we are looking for</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {skills.map((skill) => (
                <Tag key={skill} className="bg-brand-50 text-brand-700">
                  {skill}
                </Tag>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="card mt-6 flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
        <div>
          <p className="text-sm font-semibold text-slate-900">Ready to apply?</p>
          <p className="mt-1 text-sm text-slate-600">
            Posted {formatDate(job.created_at)}. You will receive a tracking code as soon as you submit.
          </p>
        </div>
        <LinkButton to={`/jobs/${job.id}/apply`} size="lg">
          Apply for this role
        </LinkButton>
      </div>
    </div>
  );
}
