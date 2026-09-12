import { useState, type FormEvent } from 'react';
import type { ApplicationFormValues } from '@/api/applications';
import { ApiError, toApiError } from '@/api/client';
import { Button } from '@/components/common/Button';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { FileField, TextAreaField, TextField } from '@/components/common/FormField';
import type { ApplicationCreated } from '@/types/api';
import { validateApplication, type FieldErrors } from '@/utils/validation';

const EMPTY: ApplicationFormValues = {
  name: '',
  email: '',
  phone: '',
  experience: '',
  profile_url: '',
  cover_note: '',
  resume: null,
};

interface ApplicationFormProps {
  onSubmit: (values: ApplicationFormValues) => Promise<ApplicationCreated>;
  onSuccess: (result: ApplicationCreated) => void;
}

export function ApplicationForm({ onSubmit, onSuccess }: ApplicationFormProps) {
  const [values, setValues] = useState<ApplicationFormValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);

  const set = <K extends keyof ApplicationFormValues>(key: K, value: ApplicationFormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    // Clear a field's error as soon as the candidate starts fixing it.
    setErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key as string];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);

    // Client-side validation is a convenience only; the server validates again.
    const clientErrors = validateApplication(values);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    try {
      onSuccess(await onSubmit(values));
    } catch (caught) {
      const apiError = toApiError(caught);
      // The API returns a per-field map for validation failures; show it inline.
      if (Object.keys(apiError.fields).length > 0) setErrors(apiError.fields);
      setFailure(apiError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {failure && (
        <ErrorMessage
          error={failure}
          title={failure.code === 'DUPLICATE_APPLICATION' ? 'You have already applied' : 'Could not submit'}
        />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Full name"
          required
          autoComplete="name"
          placeholder="Meera Nair"
          value={values.name}
          error={errors.name}
          onChange={(event) => set('name', event.target.value)}
        />
        <TextField
          label="Email address"
          required
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          hint="You will need this to track your application."
          value={values.email}
          error={errors.email}
          onChange={(event) => set('email', event.target.value)}
        />
        <TextField
          label="Phone"
          required
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          value={values.phone}
          error={errors.phone}
          onChange={(event) => set('phone', event.target.value)}
        />
        <TextField
          label="Years of experience"
          required
          placeholder="3-5 years"
          value={values.experience}
          error={errors.experience}
          onChange={(event) => set('experience', event.target.value)}
        />
      </div>

      <TextField
        label="LinkedIn or GitHub profile"
        type="url"
        placeholder="https://github.com/your-handle"
        hint="Optional, but it helps us understand your work."
        value={values.profile_url}
        error={errors.profile_url}
        onChange={(event) => set('profile_url', event.target.value)}
      />

      <TextAreaField
        label="Cover note"
        rows={5}
        maxLength={4000}
        placeholder="Tell us briefly why this role interests you."
        hint={`Optional. ${values.cover_note.length}/4000 characters.`}
        value={values.cover_note}
        error={errors.cover_note}
        onChange={(event) => set('cover_note', event.target.value)}
      />

      <FileField
        label="Resume"
        accept=".pdf,.doc,.docx"
        hint="Optional. PDF, DOC or DOCX, up to 5 MB."
        fileName={values.resume?.name ?? null}
        error={errors.resume}
        onChange={(event) => set('resume', event.target.files?.[0] ?? null)}
        onClear={() => set('resume', null)}
      />

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Fields marked <span className="text-red-500">*</span> are required.
        </p>
        <Button type="submit" size="lg" loading={submitting}>
          {submitting ? 'Submitting…' : 'Submit application'}
        </Button>
      </div>
    </form>
  );
}
