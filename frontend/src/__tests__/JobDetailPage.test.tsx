import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import JobDetailPage from '@/pages/JobDetailPage';
import { jobsApi } from '@/api/jobs';
import { ApiError } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { jobDetail } from '@/test/factories';

vi.mock('@/api/jobs');
const mocked = vi.mocked(jobsApi);

function renderAt(route = '/jobs/1') {
  return renderWithProviders(
    <Routes>
      <Route path="/jobs/:jobId" element={<JobDetailPage />} />
    </Routes>,
    { route },
  );
}

beforeEach(() => {
  mocked.detail.mockResolvedValue(jobDetail());
});

describe('JobDetailPage', () => {
  it('renders the full posting', async () => {
    renderAt();

    expect(await screen.findByRole('heading', { name: 'Senior FastAPI Developer' })).toBeInTheDocument();
    expect(screen.getByText('JOB-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Bengaluru')).toBeInTheDocument();
    expect(screen.getByText('Full time')).toBeInTheDocument();
    expect(screen.getByText('5+ years')).toBeInTheDocument();
  });

  it('splits responsibilities into a list and skills into tags', async () => {
    renderAt();

    expect(await screen.findByText('Design FastAPI services.')).toBeInTheDocument();
    expect(screen.getByText('Review pull requests.')).toBeInTheDocument();
    expect(screen.getByText('FastAPI')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
  });

  it('links through to the application form', async () => {
    renderAt();
    const applyLinks = await screen.findAllByRole('link', { name: /Apply/i });
    expect(applyLinks[0]).toHaveAttribute('href', '/jobs/1/apply');
  });

  it('shows a friendly message when the role has been closed', async () => {
    mocked.detail.mockRejectedValue(new ApiError('The requested job was not found.', 'JOB_NOT_FOUND', 404));
    renderAt();

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse open roles/i })).toBeInTheDocument();
  });

  it('shows a retryable error for an unexpected failure', async () => {
    mocked.detail.mockRejectedValue(new ApiError('The database is unavailable.', 'DATABASE_ERROR', 503));
    renderAt();

    expect(await screen.findByRole('alert')).toHaveTextContent('The database is unavailable.');
  });
});
