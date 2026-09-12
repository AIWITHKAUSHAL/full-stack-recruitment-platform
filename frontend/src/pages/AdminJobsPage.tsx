import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { jobsApi } from '@/api/jobs';
import { toApiError } from '@/api/client';
import { Button, LinkButton } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Pagination } from '@/components/common/Pagination';
import { Tag } from '@/components/common/StatusBadge';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { EMPLOYMENT_TYPE_LABELS, type AdminJobSummary } from '@/types/api';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 10;

export default function AdminJobsPage() {
  useDocumentTitle('Manage jobs');

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const activeFilter = searchParams.get('is_active') ?? '';
  const page = Number(searchParams.get('page') ?? '1');
  const debouncedSearch = useDebounce(search);

  const [pendingToggle, setPendingToggle] = useState<AdminJobSummary | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<Error | null>(null);

  const jobs = useAsync(
    () =>
      jobsApi.adminList({
        search: debouncedSearch,
        is_active: activeFilter === '' ? undefined : activeFilter === 'true',
        page,
        page_size: PAGE_SIZE,
      }),
    [debouncedSearch, activeFilter, page],
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

  const confirmToggle = async () => {
    if (!pendingToggle) return;
    setToggling(true);
    setToggleError(null);
    try {
      await jobsApi.setActive(pendingToggle.id, !pendingToggle.is_active);
      setPendingToggle(null);
      jobs.reload();
    } catch (caught) {
      setToggleError(toApiError(caught));
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Jobs</h1>
          <p className="mt-1 text-sm text-slate-600">Create roles and control what candidates can see.</p>
        </div>
        <LinkButton to="/admin/jobs/new">Create job</LinkButton>
      </header>

      <div className="card flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="job-search" className="field-label">
            Search
          </label>
          <input
            id="job-search"
            type="search"
            className="field-control"
            placeholder="Title, department or job code"
            value={search}
            onChange={(event) => update({ search: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="job-status" className="field-label">
            Visibility
          </label>
          <select
            id="job-status"
            className="field-control"
            value={activeFilter}
            onChange={(event) => update({ is_active: event.target.value })}
          >
            <option value="">All jobs</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
        </div>
      </div>

      {toggleError && <ErrorMessage error={toggleError} />}
      {jobs.error && <ErrorMessage error={jobs.error} onRetry={jobs.reload} />}
      {jobs.loading && <LoadingSpinner label="Loading jobs…" />}

      {!jobs.loading && !jobs.error && jobs.data?.items.length === 0 && (
        <EmptyState
          icon="📋"
          title="No jobs match those filters"
          description="Create your first role, or clear the filters."
          action={<LinkButton to="/admin/jobs/new">Create job</LinkButton>}
        />
      )}

      {!jobs.loading && !jobs.error && (jobs.data?.items.length ?? 0) > 0 && (
        <>
          {/* Table on wide screens, stacked cards on phones: an admin table
              that scrolls sideways on mobile is unusable. */}
          <div className="card hidden overflow-hidden lg:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Department</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 text-right font-medium">Applications</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.data!.items.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <Link to={`/admin/jobs/${job.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {job.title}
                      </Link>
                      <span className="block font-mono text-xs text-slate-400">{job.job_code}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{job.department}</td>
                    <td className="px-5 py-3.5 text-slate-600">{job.location}</td>
                    <td className="px-5 py-3.5 text-slate-600">{EMPLOYMENT_TYPE_LABELS[job.employment_type]}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-slate-900">
                      <Link to={`/admin/applications?job_id=${job.id}`} className="hover:text-brand-700 hover:underline">
                        {job.application_count}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <ActiveTag active={job.is_active} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        <LinkButton to={`/admin/jobs/${job.id}`} variant="secondary" size="sm">
                          Edit
                        </LinkButton>
                        <Button variant="ghost" size="sm" onClick={() => setPendingToggle(job)}>
                          {job.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {jobs.data!.items.map((job) => (
              <article key={job.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/admin/jobs/${job.id}`} className="font-medium text-slate-900">
                      {job.title}
                    </Link>
                    <p className="font-mono text-xs text-slate-400">{job.job_code}</p>
                  </div>
                  <ActiveTag active={job.is_active} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Tag>{job.department}</Tag>
                  <Tag>{job.location}</Tag>
                  <Tag>{EMPLOYMENT_TYPE_LABELS[job.employment_type]}</Tag>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {job.application_count} {job.application_count === 1 ? 'application' : 'applications'} ·
                  posted {formatDate(job.created_at)}
                </p>
                <div className="mt-4 flex gap-2">
                  <LinkButton to={`/admin/jobs/${job.id}`} variant="secondary" size="sm">
                    Edit
                  </LinkButton>
                  <Button variant="ghost" size="sm" onClick={() => setPendingToggle(job)}>
                    {job.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </article>
            ))}
          </div>

          <Pagination
            page={jobs.data!.page}
            pages={jobs.data!.pages}
            total={jobs.data!.total}
            pageSize={jobs.data!.page_size}
            onChange={(nextPage) => update({ page: nextPage })}
          />
        </>
      )}

      <ConfirmDialog
        open={pendingToggle !== null}
        title={pendingToggle?.is_active ? 'Deactivate this job?' : 'Activate this job?'}
        description={
          pendingToggle?.is_active
            ? `"${pendingToggle?.title}" will disappear from the public careers page and stop accepting new applications. Existing applications and candidate tracking are unaffected.`
            : `"${pendingToggle?.title}" will appear on the public careers page and start accepting applications.`
        }
        confirmLabel={pendingToggle?.is_active ? 'Deactivate' : 'Activate'}
        destructive={pendingToggle?.is_active}
        loading={toggling}
        onConfirm={confirmToggle}
        onCancel={() => setPendingToggle(null)}
      />
    </div>
  );
}

function ActiveTag({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? 'inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200'
          : 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200'
      }
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
