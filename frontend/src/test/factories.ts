import type {
  AdminJobSummary,
  ApplicationAdminDetail,
  ApplicationAdminSummary,
  ApplicationCreated,
  ApplicationTracking,
  DashboardStats,
  JobDetail,
  JobFilterOptions,
  JobSummary,
  Paginated,
} from '@/types/api';

export function paginated<T>(items: T[], overrides: Partial<Paginated<T>> = {}): Paginated<T> {
  return { items, page: 1, page_size: 9, total: items.length, pages: 1, ...overrides };
}

export function jobSummary(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: 1,
    job_code: 'JOB-2026-0001',
    title: 'Senior FastAPI Developer',
    department: 'Engineering',
    location: 'Bengaluru',
    employment_type: 'FULL_TIME',
    experience_required: '5+ years',
    is_active: true,
    created_at: '2026-01-10T10:00:00Z',
    summary: 'Own the services behind our hiring platform.',
    ...overrides,
  };
}

export function jobDetail(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 1,
    job_code: 'JOB-2026-0001',
    title: 'Senior FastAPI Developer',
    department: 'Engineering',
    location: 'Bengaluru',
    employment_type: 'FULL_TIME',
    description: 'Own the services behind our hiring and candidate platform.',
    responsibilities: 'Design FastAPI services.\nReview pull requests.',
    skills: 'Python, FastAPI, PostgreSQL',
    experience_required: '5+ years',
    is_active: true,
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

export function filterOptions(overrides: Partial<JobFilterOptions> = {}): JobFilterOptions {
  return {
    departments: ['Engineering', 'Human Resources'],
    locations: ['Bengaluru', 'Remote'],
    employment_types: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'],
    total_active_jobs: 2,
    ...overrides,
  };
}

export function applicationCreated(overrides: Partial<ApplicationCreated> = {}): ApplicationCreated {
  return {
    success: true,
    application_code: 'APP-2026-K9P4R2',
    job_title: 'Senior FastAPI Developer',
    status: 'APPLIED',
    resume_uploaded: false,
    submitted_at: '2026-02-01T09:30:00Z',
    message: 'Application received.',
    ...overrides,
  };
}

export function tracking(overrides: Partial<ApplicationTracking> = {}): ApplicationTracking {
  return {
    application_code: 'APP-2026-K9P4R2',
    job_title: 'Senior FastAPI Developer',
    job_code: 'JOB-2026-0001',
    status: 'SCREENING',
    submitted_at: '2026-02-01T09:30:00Z',
    last_updated_at: '2026-02-03T11:00:00Z',
    ...overrides,
  };
}

export function adminJob(overrides: Partial<AdminJobSummary> = {}): AdminJobSummary {
  return { ...jobSummary(), application_count: 3, ...overrides };
}

export function adminApplication(
  overrides: Partial<ApplicationAdminSummary> = {},
): ApplicationAdminSummary {
  return {
    id: 41,
    application_code: 'APP-2026-K9P4R2',
    name: 'Meera Nair',
    email: 'meera.nair@example.com',
    phone: '+91 9123456780',
    experience: '3-5 years',
    status: 'APPLIED',
    job_id: 1,
    job_title: 'Senior FastAPI Developer',
    job_code: 'JOB-2026-0001',
    has_resume: true,
    created_at: '2026-02-01T09:30:00Z',
    updated_at: '2026-02-01T09:30:00Z',
    ...overrides,
  };
}

export function adminApplicationDetail(
  overrides: Partial<ApplicationAdminDetail> = {},
): ApplicationAdminDetail {
  return {
    ...adminApplication(),
    profile_url: 'https://github.com/meera',
    cover_note: 'I would love to join.',
    admin_notes: null,
    allowed_next_statuses: ['REJECTED', 'SCREENING'],
    ...overrides,
  };
}

export function dashboardStats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    active_jobs: 12,
    total_jobs: 15,
    total_applications: 184,
    interviews: 24,
    selected: 8,
    rejected: 19,
    applications_by_status: [
      { status: 'APPLIED', count: 100 },
      { status: 'SCREENING', count: 33 },
      { status: 'INTERVIEW', count: 24 },
      { status: 'SELECTED', count: 8 },
      { status: 'REJECTED', count: 19 },
    ],
    applications_by_department: [{ department: 'Engineering', count: 120 }],
    recent_applications: [
      {
        application_code: 'APP-2026-K9P4R2',
        name: 'Meera Nair',
        job_title: 'Senior FastAPI Developer',
        status: 'APPLIED',
        created_at: '2026-02-01T09:30:00Z',
      },
    ],
    ...overrides,
  };
}
