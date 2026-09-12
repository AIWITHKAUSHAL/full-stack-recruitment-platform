import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import { adminApi } from '@/api/admin';
import { ApiError } from '@/api/client';
import { renderWithProviders, testAdmin } from '@/test/render';
import { dashboardStats } from '@/test/factories';

vi.mock('@/api/admin');
const mocked = vi.mocked(adminApi);

beforeEach(() => {
  mocked.stats.mockResolvedValue(dashboardStats());
});

describe('AdminDashboardPage', () => {
  it('renders the four headline tiles', async () => {
    renderWithProviders(<AdminDashboardPage />, { route: '/admin', auth: { admin: testAdmin } });

    // Each tile is a link, so scope the assertion to the tile rather than to
    // the page — the same number also appears in the status breakdown.
    const activeJobs = await screen.findByRole('link', { name: /Active jobs/ });
    expect(within(activeJobs).getByText('12')).toBeInTheDocument();

    const applications = screen.getByRole('link', { name: /^Applications/ });
    expect(within(applications).getByText('184')).toBeInTheDocument();

    const interviews = screen.getByRole('link', { name: /Interviews/ });
    expect(within(interviews).getByText('24')).toBeInTheDocument();

    const selected = screen.getByRole('link', { name: /Selected/ });
    expect(within(selected).getByText('8')).toBeInTheDocument();
  });

  it('renders the status and department breakdowns', async () => {
    renderWithProviders(<AdminDashboardPage />, { route: '/admin', auth: { admin: testAdmin } });

    expect(await screen.findByText('Pipeline by status')).toBeInTheDocument();
    expect(screen.getByText('Applications by department')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
  });

  it('lists recent applications', async () => {
    renderWithProviders(<AdminDashboardPage />, { route: '/admin', auth: { admin: testAdmin } });
    expect(await screen.findByText('Meera Nair')).toBeInTheDocument();
  });

  it('shows a loading state first', () => {
    renderWithProviders(<AdminDashboardPage />, { route: '/admin', auth: { admin: testAdmin } });
    expect(screen.getByText(/Loading dashboard/i)).toBeInTheDocument();
  });

  it('shows an error state when stats cannot be loaded', async () => {
    mocked.stats.mockRejectedValue(new ApiError('Your session has expired.', 'UNAUTHORIZED', 401));
    renderWithProviders(<AdminDashboardPage />, { route: '/admin', auth: { admin: testAdmin } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Your session has expired.');
  });
});
