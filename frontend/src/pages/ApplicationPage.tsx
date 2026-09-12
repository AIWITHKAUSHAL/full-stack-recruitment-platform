import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { applicationsApi, type ApplicationFormValues } from '@/api/applications';
import { jobsApi } from '@/api/jobs';
import { ApplicationForm } from '@/components/applications/ApplicationForm';
import { ApplicationSuccess } from '@/components/applications/ApplicationSuccess';
import { LinkButton } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useAsync } from '@/hooks/useAsync';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { ApplicationCreated } from '@/types/api';

export default function ApplicationPage() {
  const { jobId } = useParams();
  const id = Number(jobId);
  const { data: job, loading, error, reload } = useAsync(() => jobsApi.detail(id), [id]);
  const [submitted, setSubmitted] = useState<ApplicationCreated | null>(null);

  useDocumentTitle(job ? `Apply · ${job.title}` : 'Apply');

  if (loading) return <LoadingSpinner label="Loading role…" />;

  if (error?.code === 'JOB_NOT_FOUND') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon="📭"
          title="This role is no longer accepting applications"
          description="It may have been filled or closed since you opened the link."
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

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <ApplicationSuccess result={submitted} />
      </div>
    );
  }

  const submit = (values: ApplicationFormValues) => applicationsApi.submit(job.id, values);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-500">
        <Link to="/jobs" className="hover:text-brand-700 hover:underline">
          Open roles
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <Link to={`/jobs/${job.id}`} className="hover:text-brand-700 hover:underline">
          {job.title}
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="text-slate-700">Apply</span>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Apply for {job.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {job.department} · {job.location} · {job.experience_required}
        </p>
      </header>

      <div className="card mt-6 p-6 sm:p-8">
        <ApplicationForm onSubmit={submit} onSuccess={setSubmitted} />
      </div>
    </div>
  );
}
