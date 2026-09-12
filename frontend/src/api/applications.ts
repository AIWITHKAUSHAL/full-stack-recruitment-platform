import { api } from './client';
import type {
  ApplicationAdminDetail,
  ApplicationAdminSummary,
  ApplicationCreated,
  ApplicationStatus,
  ApplicationTracking,
  Paginated,
  ResumeDownload,
} from '@/types/api';

export interface ApplicationFormValues {
  name: string;
  email: string;
  phone: string;
  experience: string;
  profile_url: string;
  cover_note: string;
  resume: File | null;
}

export interface AdminApplicationQuery {
  search?: string;
  job_id?: number | '';
  status?: ApplicationStatus | '';
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

function params(query: AdminApplicationQuery): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== '' && value !== null),
  ) as Record<string, string | number>;
}

export const applicationsApi = {
  /**
   * Submitted as multipart/form-data so the optional resume travels with the
   * rest of the form in a single request.
   */
  submit: (jobId: number, values: ApplicationFormValues) => {
    const form = new FormData();
    form.append('name', values.name);
    form.append('email', values.email);
    form.append('phone', values.phone);
    form.append('experience', values.experience);
    if (values.profile_url) form.append('profile_url', values.profile_url);
    if (values.cover_note) form.append('cover_note', values.cover_note);
    if (values.resume) form.append('resume', values.resume);

    return api
      .post<ApplicationCreated>(`/jobs/${jobId}/applications`, form)
      .then((r) => r.data);
  },

  track: (applicationCode: string, email: string) =>
    api
      .get<ApplicationTracking>('/applications/track', {
        params: { application_code: applicationCode.trim(), email: email.trim() },
      })
      .then((r) => r.data),

  adminList: (query: AdminApplicationQuery = {}) =>
    api
      .get<Paginated<ApplicationAdminSummary>>('/admin/applications', { params: params(query) })
      .then((r) => r.data),

  adminDetail: (id: number) =>
    api.get<ApplicationAdminDetail>(`/admin/applications/${id}`).then((r) => r.data),

  updateStatus: (id: number, status: ApplicationStatus, note?: string) =>
    api
      .patch<ApplicationAdminDetail>(`/admin/applications/${id}/status`, { status, note: note || null })
      .then((r) => r.data),

  updateNotes: (id: number, adminNotes: string) =>
    api
      .patch<ApplicationAdminDetail>(`/admin/applications/${id}/notes`, { admin_notes: adminNotes })
      .then((r) => r.data),

  resumeLink: (id: number) =>
    api.get<ResumeDownload>(`/admin/applications/${id}/resume`).then((r) => r.data),
};
