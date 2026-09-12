/**
 * TypeScript mirror of the FastAPI contract.
 *
 * These enums are the ONE place the backend's controlled vocabularies are
 * repeated on the frontend (project rule R2). If `app/models/enums.py` changes,
 * this file changes in the same commit — nowhere else should contain a string
 * literal such as 'INTERVIEW'.
 */

export const EmploymentType = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACT: 'CONTRACT',
  INTERNSHIP: 'INTERNSHIP',
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
};

export const ApplicationStatus = {
  APPLIED: 'APPLIED',
  SCREENING: 'SCREENING',
  INTERVIEW: 'INTERVIEW',
  SELECTED: 'SELECTED',
  REJECTED: 'REJECTED',
} as const;
export type ApplicationStatus = (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  SELECTED: 'Selected',
  REJECTED: 'Not selected',
};

/** The candidate-facing explanation shown on the tracking page. */
export const APPLICATION_STATUS_HELP: Record<ApplicationStatus, string> = {
  APPLIED: 'Your application has been received and is waiting to be reviewed.',
  SCREENING: 'A recruiter is reviewing your profile against the role.',
  INTERVIEW: 'You have progressed to the interview stage.',
  SELECTED: 'You have been selected. The team will be in touch about next steps.',
  REJECTED: 'This application was not taken forward. Other roles remain open to you.',
};

export const PIPELINE_ORDER: ApplicationStatus[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'SELECTED'];

export type JobSort = 'newest' | 'oldest' | 'title_asc' | 'title_desc';

export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  pages: number;
}

export interface JobSummary {
  id: number;
  job_code: string;
  title: string;
  department: string;
  location: string;
  employment_type: EmploymentType;
  experience_required: string;
  is_active: boolean;
  created_at: string;
  summary: string;
}

export interface AdminJobSummary extends JobSummary {
  application_count: number;
}

export interface JobDetail {
  id: number;
  job_code: string;
  title: string;
  department: string;
  location: string;
  employment_type: EmploymentType;
  description: string;
  responsibilities: string;
  skills: string;
  experience_required: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobFilterOptions {
  departments: string[];
  locations: string[];
  employment_types: EmploymentType[];
  total_active_jobs: number;
}

export interface JobPayload {
  title: string;
  department: string;
  location: string;
  employment_type: EmploymentType;
  description: string;
  responsibilities: string;
  skills: string;
  experience_required: string;
  is_active?: boolean;
}

export interface ApplicationCreated {
  success: boolean;
  application_code: string;
  job_title: string;
  status: ApplicationStatus;
  resume_uploaded: boolean;
  submitted_at: string;
  message: string;
}

export interface ApplicationTracking {
  application_code: string;
  job_title: string;
  job_code: string;
  status: ApplicationStatus;
  submitted_at: string;
  last_updated_at: string;
}

export interface ApplicationAdminSummary {
  id: number;
  application_code: string;
  name: string;
  email: string;
  phone: string;
  experience: string;
  status: ApplicationStatus;
  job_id: number;
  job_title: string;
  job_code: string;
  has_resume: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicationAdminDetail extends ApplicationAdminSummary {
  profile_url: string | null;
  cover_note: string | null;
  admin_notes: string | null;
  allowed_next_statuses: ApplicationStatus[];
}

export interface ResumeDownload {
  url: string;
  expires_in_seconds: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in_seconds: number;
  admin_email: string;
}

export interface AdminProfile {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
}

export interface DashboardStats {
  active_jobs: number;
  total_jobs: number;
  total_applications: number;
  interviews: number;
  selected: number;
  rejected: number;
  applications_by_status: { status: ApplicationStatus; count: number }[];
  applications_by_department: { department: string; count: number }[];
  recent_applications: {
    application_code: string;
    name: string;
    job_title: string;
    status: ApplicationStatus;
    created_at: string;
  }[];
}

/** The error envelope every failing API call returns. */
export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: { fields?: Record<string, string> } };
  request_id: string;
}
