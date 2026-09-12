/**
 * Client-side form validation.
 *
 * This is a convenience that saves the candidate a round trip — it is NOT a
 * control. Every rule here is enforced again in Pydantic on the server
 * (project rule R6).
 */
import type { ApplicationFormValues } from '@/api/applications';

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
export const RESUME_EXTENSIONS = ['pdf', 'doc', 'docx'] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;

export type FieldErrors = Record<string, string>;

export function validateResume(file: File | null): string | null {
  if (!file) return null;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!RESUME_EXTENSIONS.includes(extension as (typeof RESUME_EXTENSIONS)[number])) {
    return 'Resume must be a PDF, DOC or DOCX file.';
  }
  if (file.size > RESUME_MAX_BYTES) return 'Resume must be smaller than 5 MB.';
  if (file.size === 0) return 'That file appears to be empty.';
  return null;
}

export function validateApplication(values: ApplicationFormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (values.name.trim().length < 2) errors.name = 'Enter your full name.';
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Enter a valid email address.';
  if (!PHONE_PATTERN.test(values.phone.trim())) {
    errors.phone = 'Enter a valid phone number, for example +91 98765 43210.';
  }
  if (!values.experience.trim()) errors.experience = 'Tell us how much experience you have.';
  if (values.profile_url.trim() && !/^https?:\/\//i.test(values.profile_url.trim())) {
    errors.profile_url = 'The profile link must start with http:// or https://';
  }
  if (values.cover_note.length > 4000) errors.cover_note = 'Please keep the cover note under 4000 characters.';

  const resumeError = validateResume(values.resume);
  if (resumeError) errors.resume = resumeError;

  return errors;
}

export function validateTracking(code: string, email: string): FieldErrors {
  const errors: FieldErrors = {};
  if (code.trim().length < 4) errors.application_code = 'Enter the application code you were given.';
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter the email address you applied with.';
  return errors;
}
