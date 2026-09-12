import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackApplicationPage from '@/pages/TrackApplicationPage';
import { applicationsApi } from '@/api/applications';
import { ApiError } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { tracking } from '@/test/factories';

vi.mock('@/api/applications');
const mocked = vi.mocked(applicationsApi);

beforeEach(() => {
  mocked.track.mockResolvedValue(tracking());
});

describe('TrackApplicationPage', () => {
  it('requires both the code and the email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TrackApplicationPage />, { route: '/track' });

    await user.click(screen.getByRole('button', { name: /Check status/i }));

    expect(await screen.findByText('Enter the application code you were given.')).toBeInTheDocument();
    expect(screen.getByText('Enter the email address you applied with.')).toBeInTheDocument();
    expect(mocked.track).not.toHaveBeenCalled();
  });

  it('shows the status, the job and the pipeline after a successful lookup', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TrackApplicationPage />, { route: '/track' });

    await user.type(screen.getByLabelText(/Application code/i), 'APP-2026-K9P4R2');
    await user.type(screen.getByLabelText(/Email address/i), 'meera.nair@example.com');
    await user.click(screen.getByRole('button', { name: /Check status/i }));

    expect(await screen.findByText('Senior FastAPI Developer')).toBeInTheDocument();
    // The badge and the pipeline step both say "Screening" — that duplication
    // is intentional, so assert on the count rather than a single node.
    expect(screen.getAllByText('Screening').length).toBeGreaterThan(0);
    expect(screen.getByText(/A recruiter is reviewing your profile/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Hiring progress')).toBeInTheDocument();
    expect(mocked.track).toHaveBeenCalledWith('APP-2026-K9P4R2', 'meera.nair@example.com');
  });

  it('pre-fills the code when it arrives in the URL', () => {
    renderWithProviders(<TrackApplicationPage />, { route: '/track?code=APP-2026-K9P4R2' });
    expect(screen.getByLabelText(/Application code/i)).toHaveValue('APP-2026-K9P4R2');
  });

  it('explains a failed lookup without hinting whether the code exists', async () => {
    const user = userEvent.setup();
    mocked.track.mockRejectedValue(
      new ApiError('No application matches that application code and email address.', 'APPLICATION_NOT_FOUND', 404),
    );
    renderWithProviders(<TrackApplicationPage />, { route: '/track' });

    await user.type(screen.getByLabelText(/Application code/i), 'APP-2026-NOPE22');
    await user.type(screen.getByLabelText(/Email address/i), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: /Check status/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/No application matches/i);
  });

  it('never renders internal fields for a rejected application', async () => {
    const user = userEvent.setup();
    mocked.track.mockResolvedValue(tracking({ status: 'REJECTED' }));
    renderWithProviders(<TrackApplicationPage />, { route: '/track' });

    await user.type(screen.getByLabelText(/Application code/i), 'APP-2026-K9P4R2');
    await user.type(screen.getByLabelText(/Email address/i), 'meera.nair@example.com');
    await user.click(screen.getByRole('button', { name: /Check status/i }));

    expect(await screen.findByText('Not selected')).toBeInTheDocument();
    // The progress bar is hidden for a rejection rather than showing a half-done funnel.
    expect(screen.queryByLabelText('Hiring progress')).not.toBeInTheDocument();
  });
});
