import { useState } from 'react';
import { Button, LinkButton } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { ApplicationCreated } from '@/types/api';
import { formatDateTime } from '@/utils/format';

/** Confirmation screen. The application code is the one thing the candidate
 *  must leave with, so it dominates the layout. */
export function ApplicationSuccess({ result }: { result: ApplicationCreated }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.application_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the code is on screen anyway */
    }
  };

  return (
    <div className="card animate-fade-in p-6 text-center sm:p-10">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl">
        ✓
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Application received</h1>
      <p className="mt-2 text-sm text-slate-600">
        Thank you for applying for <span className="font-medium text-slate-900">{result.job_title}</span>.
      </p>

      <div className="mt-7 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/60 p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Your application code</p>
        <p className="mt-2 select-all font-mono text-2xl font-bold tracking-wider text-brand-800 sm:text-3xl">
          {result.application_code}
        </p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={copy}>
          {copied ? 'Copied' : 'Copy code'}
        </Button>
        <p className="mt-4 text-xs leading-relaxed text-slate-600">
          Save this code. You will need it together with your email address to check your status.
        </p>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</dt>
          <dd className="mt-1.5">
            <StatusBadge status={result.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Submitted</dt>
          <dd className="mt-1.5 text-sm text-slate-700">{formatDateTime(result.submitted_at)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Resume</dt>
          <dd className="mt-1.5 text-sm text-slate-700">
            {result.resume_uploaded ? 'Uploaded' : 'Not provided'}
          </dd>
        </div>
      </dl>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <LinkButton to={`/track?code=${encodeURIComponent(result.application_code)}`}>
          Track this application
        </LinkButton>
        <LinkButton to="/jobs" variant="secondary">
          Browse more roles
        </LinkButton>
      </div>
    </div>
  );
}
