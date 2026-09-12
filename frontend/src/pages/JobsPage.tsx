import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { jobsApi } from '@/api/jobs';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { JobCardSkeleton } from '@/components/common/LoadingSpinner';
import { Pagination } from '@/components/common/Pagination';
import { Button } from '@/components/common/Button';
import { JobCard } from '@/components/jobs/JobCard';
import { JobFilters, type JobFilterValues } from '@/components/jobs/JobFilters';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { EmploymentType, JobSort } from '@/types/api';

const PAGE_SIZE = 9;

export default function JobsPage() {
  useDocumentTitle('Open roles');

  // Filters live in the URL so a filtered search can be shared, bookmarked and
  // survives the back button.
  const [searchParams, setSearchParams] = useSearchParams();

  const values: JobFilterValues = useMemo(
    () => ({
      search: searchParams.get('search') ?? '',
      department: searchParams.get('department') ?? '',
      location: searchParams.get('location') ?? '',
      employment_type: searchParams.get('employment_type') ?? '',
      sort: (searchParams.get('sort') as JobSort) || 'newest',
    }),
    [searchParams],
  );
  const page = Number(searchParams.get('page') ?? '1');

  const debouncedSearch = useDebounce(values.search);

  const options = useAsync(() => jobsApi.filterOptions(), []);
  const jobs = useAsync(
    () =>
      jobsApi.list({
        search: debouncedSearch,
        department: values.department,
        location: values.location,
        employment_type: values.employment_type as EmploymentType | '',
        sort: values.sort,
        page,
        page_size: PAGE_SIZE,
      }),
    [debouncedSearch, values.department, values.location, values.employment_type, values.sort, page],
  );

  const update = useCallback(
    (patch: Partial<JobFilterValues & { page: number }>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(patch).forEach(([key, value]) => {
        if (value === '' || value === undefined || value === null) next.delete(key);
        else next.set(key, String(value));
      });
      // Any filter change resets to page 1, otherwise page 3 of a new search is empty.
      if (!('page' in patch)) next.delete('page');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const reset = useCallback(() => setSearchParams(new URLSearchParams(), { replace: true }), [setSearchParams]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Open roles</h1>
        <p className="mt-2 text-sm text-slate-600">
          {options.data
            ? `${options.data.total_active_jobs} active ${options.data.total_active_jobs === 1 ? 'opening' : 'openings'} across ${options.data.departments.length} ${options.data.departments.length === 1 ? 'department' : 'departments'}.`
            : 'Loading openings…'}
        </p>
      </header>

      <JobFilters
        values={values}
        options={options.data}
        resultCount={jobs.loading ? undefined : jobs.data?.total}
        onChange={update}
        onReset={reset}
      />

      <div className="mt-8">
        {jobs.error && <ErrorMessage error={jobs.error} onRetry={jobs.reload} />}

        {jobs.loading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <JobCardSkeleton key={index} />
            ))}
          </div>
        )}

        {!jobs.loading && !jobs.error && jobs.data?.items.length === 0 && (
          <EmptyState
            title="No roles match those filters"
            description="Try a different keyword, or clear the filters to see every open role."
            action={
              <Button variant="secondary" onClick={reset}>
                Reset filters
              </Button>
            }
          />
        )}

        {!jobs.loading && !jobs.error && (jobs.data?.items.length ?? 0) > 0 && (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.data!.items.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
            <Pagination
              page={jobs.data!.page}
              pages={jobs.data!.pages}
              total={jobs.data!.total}
              pageSize={jobs.data!.page_size}
              onChange={(nextPage) => {
                update({ page: nextPage });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
