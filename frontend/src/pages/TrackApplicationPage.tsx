import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { applicationsApi } from '@/api/applications';
import { ApiError, toApiError } from '@/api/client';
import { TrackingResult } from '@/components/applications/TrackingResult';
import { Button } from '@/components/common/Button';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { TextField } from '@/components/common/FormField';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { ApplicationTracking } from '@/types/api';
import { validateTracking, type FieldErrors } from '@/utils/validation';

export default function TrackApplicationPage() {
  useDocumentTitle('Track your application');

  const [searchParams] = useSearchParams();
  // Pre-filled when the candidate arrives from the confirmation screen.
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ApplicationTracking | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setResult(null);

    const clientErrors = validateTracking(code, email);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      setResult(await applicationsApi.track(code, email));
    } catch (caught) {
      setFailure(toApiError(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Track your application</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Enter the application code you received when you applied, together with the email address
          you used. Both are required — the code on its own will not open an application.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="card mt-6 space-y-5 p-6 sm:p-8">
        <TextField
          label="Application code"
          required
          placeholder="APP-2026-K9P4R2"
          className="font-mono uppercase"
          value={code}
          error={errors.application_code}
          onChange={(event) => setCode(event.target.value)}
        />
        <TextField
          label="Email address"
          required
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          error={errors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" size="lg" loading={loading} className="w-full sm:w-auto">
          {loading ? 'Checking…' : 'Check status'}
        </Button>
      </form>

      {failure && (
        <div className="mt-6">
          <ErrorMessage
            error={failure}
            title={failure.code === 'APPLICATION_NOT_FOUND' ? 'No matching application' : 'Could not check status'}
          />
        </div>
      )}

      {result && (
        <div className="mt-6">
          <TrackingResult result={result} />
        </div>
      )}
    </div>
  );
}
