import { Link } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { StatusBadge } from '@/components/common/StatusBadge';
import { BreakdownBar, StatCard } from '@/components/dashboard/StatCard';
import { useAsync } from '@/hooks/useAsync';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { APPLICATION_STATUS_LABELS } from '@/types/api';
import { formatDate } from '@/utils/format';

const STATUS_BAR_COLOURS: Record<string, string> = {
  APPLIED: 'bg-slate-400',
  SCREENING: 'bg-amber-400',
  INTERVIEW: 'bg-brand-500',
  SELECTED: 'bg-emerald-500',
  REJECTED: 'bg-red-400',
};

export default function AdminDashboardPage() {
  useDocumentTitle('Admin dashboard');
  const { data, loading, error, reload } = useAsync(() => adminApi.stats(), []);

  if (loading) return <LoadingSpinner label="Loading dashboard…" />;
  if (error || !data) return <ErrorMessage error={error} onRetry={reload} />;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Hiring activity at a glance.</p>
      </header>

      <section aria-label="Key statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active jobs" value={data.active_jobs} hint={`${data.total_jobs} total`} to="/admin/jobs" tone="brand" />
        <StatCard label="Applications" value={data.total_applications} hint="All time" to="/admin/applications" />
        <StatCard
          label="Interviews"
          value={data.interviews}
          hint="Currently at interview stage"
          to="/admin/applications?status=INTERVIEW"
          tone="amber"
        />
        <StatCard
          label="Selected"
          value={data.selected}
          hint={`${data.rejected} not selected`}
          to="/admin/applications?status=SELECTED"
          tone="emerald"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">Pipeline by status</h2>
          <div className="mt-4">
            <BreakdownBar
              rows={data.applications_by_status.map((row) => ({
                label: APPLICATION_STATUS_LABELS[row.status],
                count: row.count,
                className: STATUS_BAR_COLOURS[row.status],
              }))}
            />
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">Applications by department</h2>
          <div className="mt-4">
            {data.applications_by_department.length === 0 ? (
              <p className="text-sm text-slate-500">No applications yet.</p>
            ) : (
              <BreakdownBar
                rows={data.applications_by_department.map((row) => ({
                  label: row.department,
                  count: row.count,
                }))}
              />
            )}
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">Recent applications</h2>
          <Link to="/admin/applications" className="text-sm font-medium text-brand-600 hover:underline">
            View all →
          </Link>
        </div>

        {data.recent_applications.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No applications yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.recent_applications.map((row) => (
              <li key={row.application_code} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{row.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {row.job_title} · <span className="font-mono">{row.application_code}</span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400">{formatDate(row.created_at)}</span>
                  <StatusBadge status={row.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
