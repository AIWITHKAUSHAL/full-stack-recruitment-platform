import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { applicationsApi } from '@/api/applications';
import { ApiError, toApiError } from '@/api/client';
import { StatusSelector } from '@/components/admin/StatusSelector';
import { Button, LinkButton } from '@/components/common/Button';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useAsync } from '@/hooks/useAsync';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { ApplicationAdminDetail, ApplicationStatus } from '@/types/api';
import { formatDateTime } from '@/utils/format';

export default function AdminApplicationDetailPage() {
  const { applicationId } = useParams();
  const id = Number(applicationId);

  const { data, loading, error, reload } = useAsync(() => applicationsApi.adminDetail(id), [id]);
  const [application, setApplication] = useState<ApplicationAdminDetail | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [notesSaved, setNotesSaved] = useState(false);

  const current = application ?? data;
  useDocumentTitle(current ? `${current.name} · Application` : 'Application');

  if (loading) return <LoadingSpinner label="Loading application…" />;
  if (error || !current) return <ErrorMessage error={error} onRetry={reload} />;

  const notesValue = notes ?? current.admin_notes ?? '';

  const changeStatus = async (status: ApplicationStatus, note: string) => {
    setActionError(null);
    setSavingStatus(true);
    try {
      const updated = await applicationsApi.updateStatus(current.id, status, note);
      setApplication(updated);
      setNotes(null);
    } catch (caught) {
      // An illegal transition comes back as INVALID_STATUS_TRANSITION with a
      // message that names the allowed next steps.
      setActionError(toApiError(caught));
    } finally {
      setSavingStatus(false);
    }
  };

  const saveNotes = async () => {
    setActionError(null);
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      const updated = await applicationsApi.updateNotes(current.id, notesValue);
      setApplication(updated);
      setNotes(null);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } catch (caught) {
      setActionError(toApiError(caught));
    } finally {
      setSavingNotes(false);
    }
  };

  const openResume = async () => {
    setActionError(null);
    try {
      const link = await applicationsApi.resumeLink(current.id);
      // Short-lived link: a presigned S3 URL in AWS, a signed API URL locally.
      window.open(link.url, '_blank', 'noopener');
    } catch (caught) {
      setActionError(toApiError(caught));
    }
  };

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        <Link to="/admin/applications" className="hover:text-brand-700 hover:underline">
          Applications
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="text-slate-700">{current.name}</span>
      </nav>

      {actionError && <ErrorMessage error={actionError} title="Action failed" />}

      <header className="card flex flex-wrap items-start justify-between gap-4 p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{current.name}</h1>
          <p className="mt-1 font-mono text-xs text-slate-400">{current.application_code}</p>
          <p className="mt-3 text-sm text-slate-600">
            Applied for{' '}
            <Link to={`/admin/jobs/${current.job_id}`} className="font-medium text-brand-600 hover:underline">
              {current.job_title}
            </Link>{' '}
            on {formatDateTime(current.created_at)}
          </p>
        </div>
        <StatusBadge status={current.status} className="text-sm" />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-6">
            <h2 className="text-base font-semibold text-slate-900">Candidate details</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Email', value: <a href={`mailto:${current.email}`} className="text-brand-600 hover:underline">{current.email}</a> },
                { label: 'Phone', value: <a href={`tel:${current.phone}`} className="text-brand-600 hover:underline">{current.phone}</a> },
                { label: 'Experience', value: current.experience },
                {
                  label: 'Profile',
                  value: current.profile_url ? (
                    <a href={current.profile_url} target="_blank" rel="noopener noreferrer" className="break-all text-brand-600 hover:underline">
                      {current.profile_url}
                    </a>
                  ) : (
                    '—'
                  ),
                },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{item.label}</dt>
                  <dd className="mt-1 text-sm text-slate-800">{item.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 border-t border-slate-100 pt-5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">Resume</h3>
              {current.has_resume ? (
                <div className="mt-2 flex items-center gap-3">
                  <Button variant="secondary" size="sm" onClick={openResume}>
                    Open resume
                  </Button>
                  <span className="text-xs text-slate-500">
                    Opens a link that expires in a few minutes. The bucket itself stays private.
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No resume was uploaded.</p>
              )}
            </div>
          </section>

          {current.cover_note && (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-slate-900">Cover note</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {current.cover_note}
              </p>
            </section>
          )}

          <section className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Internal notes</h2>
              {notesSaved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Only administrators can see these. They are never returned by the candidate tracking API.
            </p>
            <textarea
              rows={6}
              className="field-control mt-3"
              placeholder="Screening notes, interview feedback, decisions…"
              value={notesValue}
              onChange={(event) => setNotes(event.target.value)}
            />
            <div className="mt-3 flex justify-end">
              <Button size="sm" loading={savingNotes} onClick={saveNotes}>
                Save notes
              </Button>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-base font-semibold text-slate-900">Hiring pipeline</h2>
            <p className="mt-1 text-xs text-slate-500">
              Current stage: <span className="font-medium text-slate-700">{current.status}</span>
            </p>
            <div className="mt-4">
              <StatusSelector
                current={current.status}
                allowed={current.allowed_next_statuses}
                saving={savingStatus}
                onChange={changeStatus}
              />
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-base font-semibold text-slate-900">Timeline</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Submitted</dt>
                <dd className="mt-0.5 text-slate-700">{formatDateTime(current.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Last updated</dt>
                <dd className="mt-0.5 text-slate-700">{formatDateTime(current.updated_at)}</dd>
              </div>
            </dl>
            <LinkButton to="/admin/applications" variant="secondary" size="sm" className="mt-5 w-full">
              Back to applications
            </LinkButton>
          </section>
        </div>
      </div>
    </div>
  );
}
