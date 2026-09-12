import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminApplicationsPage from '@/pages/AdminApplicationsPage';
import { applicationsApi } from '@/api/applications';
import { jobsApi } from '@/api/jobs';
import { renderWithProviders, testAdmin } from '@/test/render';
import { adminApplication, adminJob, paginated } from '@/test/factories';

vi.mock('@/api/applications');
vi.mock('@/api/jobs');

const mockedApplications = vi.mocked(applicationsApi);
const mockedJobs = vi.mocked(jobsApi);

const ROWS = [
  adminApplication(),
  adminApplication({ id: 42, application_code: 'APP-2026-B7T3M9', name: 'Rohan Desai', status: 'INTERVIEW' }),
];

beforeEach(() => {
  mockedJobs.adminList.mockResolvedValue(paginated([adminJob()]));
  mockedApplications.adminList.mockResolvedValue(paginated(ROWS, { page_size: 15 }));
});

const authed = { route: '/admin/applications', auth: { admin: testAdmin } };

describe('AdminApplicationsPage', () => {
  it('renders the applications returned by the API', async () => {
    renderWithProviders(<AdminApplicationsPage />, authed);

    expect(await screen.findAllByText('Meera Nair')).not.toHaveLength(0);
    expect(screen.getAllByText('Rohan Desai').length).toBeGreaterThan(0);
    expect(screen.getAllByText('APP-2026-K9P4R2').length).toBeGreaterThan(0);
  });

  it('shows a loading state before the rows arrive', () => {
    renderWithProviders(<AdminApplicationsPage />, authed);
    expect(screen.getByText(/Loading applications/i)).toBeInTheDocument();
  });

  it('sends the status filter to the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminApplicationsPage />, authed);
    await screen.findAllByText('Meera Nair');

    await user.selectOptions(screen.getByLabelText('Status'), 'INTERVIEW');

    await waitFor(() =>
      expect(mockedApplications.adminList).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'INTERVIEW' }),
      ),
    );
  });

  it('reads the status filter from the URL (the dashboard links in this way)', async () => {
    renderWithProviders(<AdminApplicationsPage />, {
      route: '/admin/applications?status=SELECTED',
      auth: { admin: testAdmin },
    });

    await waitFor(() =>
      expect(mockedApplications.adminList).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SELECTED' }),
      ),
    );
  });

  it('shows an empty state when nothing matches', async () => {
    mockedApplications.adminList.mockResolvedValue(paginated([], { total: 0, pages: 0 }));
    renderWithProviders(<AdminApplicationsPage />, authed);

    expect(await screen.findByText(/No applications match those filters/i)).toBeInTheDocument();
  });

  it('links each row to the candidate detail page', async () => {
    renderWithProviders(<AdminApplicationsPage />, authed);
    const review = await screen.findAllByRole('link', { name: /Review/i });
    expect(review[0]).toHaveAttribute('href', '/admin/applications/41');
  });
});
