import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobsPage from '@/pages/JobsPage';
import { jobsApi } from '@/api/jobs';
import { ApiError } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { filterOptions, jobSummary, paginated } from '@/test/factories';

vi.mock('@/api/jobs');

const mockedJobs = vi.mocked(jobsApi);

const JOBS = [
  jobSummary(),
  jobSummary({ id: 2, job_code: 'JOB-2026-0002', title: 'React Frontend Engineer', location: 'Delhi NCR' }),
];

beforeEach(() => {
  mockedJobs.filterOptions.mockResolvedValue(filterOptions());
  mockedJobs.list.mockResolvedValue(paginated(JOBS));
});

describe('JobsPage', () => {
  it('renders the jobs returned by the API', async () => {
    renderWithProviders(<JobsPage />, { route: '/jobs' });

    expect(await screen.findByText('Senior FastAPI Developer')).toBeInTheDocument();
    expect(screen.getByText('React Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByText('JOB-2026-0001')).toBeInTheDocument();
  });

  it('shows a loading state before the data arrives', () => {
    renderWithProviders(<JobsPage />, { route: '/jobs' });
    expect(screen.getByText(/Loading openings/i)).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    mockedJobs.list.mockResolvedValue(paginated([], { total: 0, pages: 0 }));
    renderWithProviders(<JobsPage />, { route: '/jobs' });

    expect(await screen.findByText(/No roles match those filters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset filters/i })).toBeInTheDocument();
  });

  it('shows an error state with a retry action', async () => {
    mockedJobs.list.mockRejectedValue(new ApiError('The database is unavailable.', 'DATABASE_ERROR', 503, {}, 'req-1'));
    renderWithProviders(<JobsPage />, { route: '/jobs' });

    expect(await screen.findByRole('alert')).toHaveTextContent('The database is unavailable.');
    expect(screen.getByText(/req-1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
  });

  it('sends the department filter to the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<JobsPage />, { route: '/jobs' });
    await screen.findByText('Senior FastAPI Developer');

    await user.selectOptions(screen.getByLabelText('Department'), 'Engineering');

    await waitFor(() =>
      expect(mockedJobs.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ department: 'Engineering', page: 1 }),
      ),
    );
  });

  it('debounces the search box and sends the query', async () => {
    const user = userEvent.setup();
    renderWithProviders(<JobsPage />, { route: '/jobs' });
    await screen.findByText('Senior FastAPI Developer');

    await user.type(screen.getByLabelText('Search'), 'react');

    await waitFor(
      () => expect(mockedJobs.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'react' })),
      { timeout: 2000 },
    );
  });

  it('reads filters from the URL so a filtered search can be shared', async () => {
    renderWithProviders(<JobsPage />, { route: '/jobs?department=Engineering&location=Remote' });

    await waitFor(() =>
      expect(mockedJobs.list).toHaveBeenCalledWith(
        expect.objectContaining({ department: 'Engineering', location: 'Remote' }),
      ),
    );
  });

  it('links each card to its detail and apply pages', async () => {
    renderWithProviders(<JobsPage />, { route: '/jobs' });
    await screen.findByText('Senior FastAPI Developer');

    const detailLinks = screen.getAllByRole('link', { name: /View details/i });
    expect(detailLinks[0]).toHaveAttribute('href', '/jobs/1');
    expect(screen.getAllByRole('link', { name: /^Apply$/i })[0]).toHaveAttribute('href', '/jobs/1/apply');
  });
});
