import { api } from './client';
import type {
  AdminJobSummary,
  JobDetail,
  JobFilterOptions,
  JobPayload,
  JobSort,
  JobSummary,
  Paginated,
  EmploymentType,
} from '@/types/api';

export interface JobQuery {
  search?: string;
  department?: string;
  location?: string;
  employment_type?: EmploymentType | '';
  sort?: JobSort;
  page?: number;
  page_size?: number;
  is_active?: boolean;
}

/** Drops empty values so the URL stays clean and the backend sees real filters only. */
function params(query: JobQuery): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== '' && value !== null),
  ) as Record<string, string | number | boolean>;
}

export const jobsApi = {
  list: (query: JobQuery = {}) =>
    api.get<Paginated<JobSummary>>('/jobs', { params: params(query) }).then((r) => r.data),

  detail: (jobId: number) => api.get<JobDetail>(`/jobs/${jobId}`).then((r) => r.data),

  filterOptions: () => api.get<JobFilterOptions>('/jobs/filters').then((r) => r.data),

  adminList: (query: JobQuery = {}) =>
    api.get<Paginated<AdminJobSummary>>('/admin/jobs', { params: params(query) }).then((r) => r.data),

  adminDetail: (jobId: number) => api.get<JobDetail>(`/admin/jobs/${jobId}`).then((r) => r.data),

  create: (payload: JobPayload) => api.post<JobDetail>('/admin/jobs', payload).then((r) => r.data),

  update: (jobId: number, payload: Partial<JobPayload>) =>
    api.patch<JobDetail>(`/admin/jobs/${jobId}`, payload).then((r) => r.data),

  setActive: (jobId: number, isActive: boolean) =>
    api
      .patch<JobDetail>(`/admin/jobs/${jobId}/${isActive ? 'activate' : 'deactivate'}`)
      .then((r) => r.data),
};
