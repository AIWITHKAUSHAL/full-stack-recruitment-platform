import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import AdminApplicationDetailPage from '@/pages/AdminApplicationDetailPage';
import { applicationsApi } from '@/api/applications';
import { ApiError } from '@/api/client';
import { renderWithProviders, testAdmin } from '@/test/render';
import { adminApplicationDetail } from '@/test/factories';

vi.mock('@/api/applications');
const mocked = vi.mocked(applicationsApi);

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/applications/:applicationId" element={<AdminApplicationDetailPage />} />
    </Routes>,
    { route: '/admin/applications/41', auth: { admin: testAdmin } },
  );
}

beforeEach(() => {
  mocked.adminDetail.mockResolvedValue(adminApplicationDetail());
});

describe('AdminApplicationDetailPage', () => {
  it('shows the candidate, the cover note and the internal notes field', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Meera Nair' })).toBeInTheDocument();
    expect(screen.getByText('meera.nair@example.com')).toBeInTheDocument();
    expect(screen.getByText('I would love to join.')).toBeInTheDocument();
    expect(screen.getByText('Internal notes')).toBeInTheDocument();
  });

  it('offers only the transitions the API says are legal', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: 'Meera Nair' });

    expect(screen.getByRole('button', { name: 'Screening' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not selected' })).toBeInTheDocument();
    // APPLIED cannot jump straight to Interview or Selected.
    expect(screen.queryByRole('button', { name: 'Interview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Selected' })).not.toBeInTheDocument();
  });

  it('moves the candidate to the next stage', async () => {
    const user = userEvent.setup();
    mocked.updateStatus.mockResolvedValue(
      adminApplicationDetail({ status: 'SCREENING', allowed_next_statuses: ['INTERVIEW', 'REJECTED'] }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Meera Nair' });

    await user.click(screen.getByRole('button', { name: 'Screening' }));
    await user.type(screen.getByLabelText(/Note \(optional\)/i), 'Strong Python background.');
    await user.click(screen.getByRole('button', { name: /Move to Screening/i }));

    await waitFor(() =>
      expect(mocked.updateStatus).toHaveBeenCalledWith(41, 'SCREENING', 'Strong Python background.'),
    );
    // The new stage's legal transitions replace the old ones.
    expect(await screen.findByRole('button', { name: 'Interview' })).toBeInTheDocument();
  });

  it('surfaces an illegal transition rejected by the server', async () => {
    const user = userEvent.setup();
    mocked.updateStatus.mockRejectedValue(
      new ApiError(
        'Cannot move an application from APPLIED to SELECTED. Allowed from APPLIED: REJECTED, SCREENING.',
        'INVALID_STATUS_TRANSITION',
        409,
      ),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Meera Nair' });

    await user.click(screen.getByRole('button', { name: 'Screening' }));
    await user.click(screen.getByRole('button', { name: /Move to Screening/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot move an application/i);
  });

  it('says nothing more can be done once a decision is final', async () => {
    mocked.adminDetail.mockResolvedValue(
      adminApplicationDetail({ status: 'SELECTED', allowed_next_statuses: [] }),
    );
    renderDetail();

    expect(await screen.findByText(/reached a final decision/i)).toBeInTheDocument();
  });

  it('saves internal notes', async () => {
    const user = userEvent.setup();
    mocked.updateNotes.mockResolvedValue(adminApplicationDetail({ admin_notes: 'Scheduled a design round.' }));
    renderDetail();
    await screen.findByRole('heading', { name: 'Meera Nair' });

    await user.type(screen.getByPlaceholderText(/Screening notes/i), 'Scheduled a design round.');
    await user.click(screen.getByRole('button', { name: /Save notes/i }));

    await waitFor(() => expect(mocked.updateNotes).toHaveBeenCalledWith(41, 'Scheduled a design round.'));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('requests a short-lived link before opening a resume', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    mocked.resumeLink.mockResolvedValue({ url: 'https://example.com/signed', expires_in_seconds: 300 });
    renderDetail();
    await screen.findByRole('heading', { name: 'Meera Nair' });

    await user.click(screen.getByRole('button', { name: /Open resume/i }));

    await waitFor(() => expect(mocked.resumeLink).toHaveBeenCalledWith(41));
    expect(open).toHaveBeenCalledWith('https://example.com/signed', '_blank', 'noopener');
  });
});
