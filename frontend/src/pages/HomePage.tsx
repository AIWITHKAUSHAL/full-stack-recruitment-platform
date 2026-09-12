import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { jobsApi } from '@/api/jobs';
import { LinkButton } from '@/components/common/Button';
import { JobCardSkeleton } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { JobCard } from '@/components/jobs/JobCard';
import { useAsync } from '@/hooks/useAsync';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function HomePage() {
  useDocumentTitle();

  const filters = useAsync(() => jobsApi.filterOptions(), []);
  const latest = useAsync(() => jobsApi.list({ page_size: 6, sort: 'newest' }), []);

  const activeCount = filters.data?.total_active_jobs ?? 0;
  const departments = useMemo(() => filters.data?.departments.slice(0, 6) ?? [], [filters.data]);

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Careers</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Find your next opportunity
            </h1>
            <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
              Explore open roles, apply online, and track your application from submission through
              the hiring process — with a code that is yours alone.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to="/jobs" size="lg">
                Browse {activeCount > 0 ? `${activeCount} open ${activeCount === 1 ? 'role' : 'roles'}` : 'open roles'}
              </LinkButton>
              <LinkButton to="/track" variant="secondary" size="lg">
                Track an application
              </LinkButton>
            </div>

            {departments.length > 0 && (
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-500">Hiring in</span>
                {departments.map((department) => (
                  <Link
                    key={department}
                    to={`/jobs?department=${encodeURIComponent(department)}`}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700"
                  >
                    {department}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { step: '1', title: 'Find a role', body: 'Search and filter by department, location and employment type.' },
            { step: '2', title: 'Apply online', body: 'Submit your details in a couple of minutes, with an optional resume.' },
            { step: '3', title: 'Track progress', body: 'Use your application code and email to follow every stage.' },
          ].map((item) => (
            <div key={item.step} className="card p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {item.step}
              </span>
              <h2 className="mt-4 text-base font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Latest openings</h2>
          <Link to="/jobs" className="text-sm font-medium text-brand-600 hover:underline">
            View all roles →
          </Link>
        </div>

        <div className="mt-6">
          {latest.error && <ErrorMessage error={latest.error} onRetry={latest.reload} />}

          {latest.loading && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <JobCardSkeleton key={index} />
              ))}
            </div>
          )}

          {!latest.loading && !latest.error && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {latest.data?.items.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
