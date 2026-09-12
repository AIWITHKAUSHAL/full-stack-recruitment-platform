import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { applicationsApi } from '@/api/applications';
import { jobsApi } from '@/api/jobs';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Pagination } from '@/components/common/Pagination';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { APPLICATION_STATUS_LABELS, ApplicationStatus } from '@/types/api';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 15;

export default function AdminApplicationsPage() {
  useDocumentTitle('Applications');

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const jobId = searchParams.get('job_id') ?? '';
  const dateFrom = searchParams.get('date_from') ?? '';
  const page = Number(searchParams.get('page') ?? '1');
  const debouncedSearch = useDebounce(search);

  // page_size 100 is the API maximum; the job filter needs every job, not a page.
  const jobs = useAsync(() => jobsApi.adminList({ page_size: 100 }), []);

  const applications = useAsync(
    () =>
      applicationsApi.adminList({
        search: debouncedSearch,
        status: (status || '') as ApplicationStatus | '',
        job_id: jobId ? Number(jobId) : '',
        date_from: dateFrom || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    [debouncedSearch, status, jobId, dateFrom, page],
  );

  const update = useCallback(
    (patch: Record<string, string | number>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(patch).forEach(([key, value]) => {
        if (value === '') next.delete(key);
        else next.set(key, String(value));
      });
      if (!('page' in patch)) next.delete('page');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const hasFilters = Boolean(search || status || jobId || dateFrom);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Applications</h1>
        <p className="mt-1 text-sm text-slate-600">Review candidates and move them through the pipeline.</p>
      </header>

      <div className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="app-search" className="field-label">
            Search
          </label>
          <input
            id="app-search"
            type="search"
            className="field-control"
            placeholder="Name, email or code"
            value={search}
            onChange={(event) => update({ search: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="app-status" className="field-label">
            Status
          </label>
          <select
            id="app-status"
            className="field-control"
            value={status}
            onChange={(event) => update({ status: event.target.value })}
          >
            <option value="">All statuses</option>
            {Object.values(ApplicationStatus).map((value) => (
              <option key={value} value={value}>
                {APPLICATION_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="app-job" className="field-label">
            Job
          </label>
          <select
            id="app-job"
            className="field-control"
            value={jobId}
            onChange={(event) => update({ job_id: event.target.value })}
          >
            <option value="">All jobs</option>
            {jobs.data?.items.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="app-from" className="field-label">
            Applied on or after
          </label>
          <input
            id="app-from"
            type="date"
            className="field-control"
            value={dateFrom}
            onChange={(event) => update({ date_from: event.target.value })}
          />
        </div>

        {hasFilters && (
          <div className="sm:col-span-2 lg:col-span-4">
            <Button variant="ghost" size="sm" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}>
              Reset filters
            </Button>
          </div>
        )}
      </div>

      {applications.error && <ErrorMessage error={applications.error} onRetry={applications.reload} />}
      {applications.loading && <LoadingSpinner label="Loading applications…" />}

      {!applications.loading && !applications.error && applications.data?.items.length === 0 && (
        <EmptyState
          icon="🗂"
          title="No applications match those filters"
          description={hasFilters ? 'Try widening the filters.' : 'Applications will appear here as candidates apply.'}
        />
      )}

      {!applications.loading && !applications.error && (applications.data?.items.length ?? 0) > 0 && (
        <>
          <div className="card hidden overflow-hidden lg:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Candidate</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Experience</th>
                  <th className="px-5 py-3 font-medium">Applied</th>
                  <th className="px-5 py-3 font-medium">Resume</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.data!.items.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <Link to={`/admin/applications/${row.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {row.name}
                      </Link>
                      <span className="block text-xs text-slate-500">{row.email}</span>
                      <span className="block font-mono text-xs text-slate-400">{row.application_code}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{row.job_title}</td>
                    <td className="px-5 py-3.5 text-slate-600">{row.experience}</td>
                    <td className="px-5 py-3.5 text-slate-600">{formatDate(row.created_at)}</td>
                    <td className="px-5 py-3.5 text-slate-600">{row.has_resume ? 'Yes' : '—'}</td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/admin/applications/${row.id}`}
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {applications.data!.items.map((row) => (
              <Link key={row.id} to={`/admin/applications/${row.id}`} className="card block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{row.name}</p>
                    <p className="truncate text-xs text-slate-500">{row.email}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <p className="mt-2 text-sm text-slate-600">{row.job_title}</p>
                <p className="mt-1 text-xs text-slate-400">
                  <span className="font-mono">{row.application_code}</span> · {formatDate(row.created_at)}
                </p>
              </Link>
            ))}
          </div>

          <Pagination
            page={applications.data!.page}
            pages={applications.data!.pages}
            total={applications.data!.total}
            pageSize={applications.data!.page_size}
            onChange={(nextPage) => update({ page: nextPage })}
          />
        </>
      )}
    </div>
  );
}
