import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationForm } from '@/components/applications/ApplicationForm';
import { ApiError } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { applicationCreated } from '@/test/factories';

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Full name/i), 'Meera Nair');
  await user.type(screen.getByLabelText(/Email address/i), 'meera.nair@example.com');
  await user.type(screen.getByLabelText(/^Phone/i), '+91 9123456780');
  await user.type(screen.getByLabelText(/Years of experience/i), '3-5 years');
}

describe('ApplicationForm', () => {
  it('blocks submission and shows field errors when the form is empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<ApplicationForm onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Submit application/i }));

    expect(await screen.findByText('Enter your full name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before calling the API', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<ApplicationForm onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText(/Full name/i), 'Meera Nair');
    await user.type(screen.getByLabelText(/Email address/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^Phone/i), '+91 9123456780');
    await user.type(screen.getByLabelText(/Years of experience/i), '3 years');
    await user.click(screen.getByRole('button', { name: /Submit application/i }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a profile URL that is not http(s)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<ApplicationForm onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await fillValidForm(user);
    await user.type(screen.getByLabelText(/LinkedIn or GitHub/i), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: /Submit application/i }));

    expect(await screen.findByText(/must start with http/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a resume with a disallowed extension', async () => {
    // applyAccept: false bypasses the input's accept attribute, so the test
    // exercises our own validation rather than the browser's file-picker filter.
    const user = userEvent.setup({ applyAccept: false });
    const onSubmit = vi.fn();
    renderWithProviders(<ApplicationForm onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await fillValidForm(user);
    await user.upload(
      screen.getByLabelText(/Resume/i),
      new File(['MZ'], 'payload.exe', { type: 'application/octet-stream' }),
    );
    await user.click(screen.getByRole('button', { name: /Submit application/i }));

    expect(await screen.findByText('Resume must be a PDF, DOC or DOCX file.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid values and reports success upward', async () => {
    const user = userEvent.setup();
    const created = applicationCreated();
    const onSubmit = vi.fn().mockResolvedValue(created);
    const onSuccess = vi.fn();
    renderWithProviders(<ApplicationForm onSubmit={onSubmit} onSuccess={onSuccess} />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /Submit application/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(created));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Meera Nair', email: 'meera.nair@example.com' }),
    );
  });

  it('renders server-side field errors returned by the API', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError('Please correct the highlighted fields.', 'VALIDATION_ERROR', 422, {
        phone: 'Enter a valid phone number, for example +91 98765 43210',
      }),
    );
    renderWithProviders(<ApplicationForm onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /Submit application/i }));

    expect(await screen.findByText(/Enter a valid phone number/i)).toBeInTheDocument();
  });

  it('explains a duplicate application clearly', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError('You have already applied to this job with this email address.', 'DUPLICATE_APPLICATION', 409),
    );
    renderWithProviders(<ApplicationForm onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /Submit application/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already applied/i);
  });

  it('disables the submit button while the request is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: (value: unknown) => void;
    const onSubmit = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));
    renderWithProviders(<ApplicationForm onSubmit={onSubmit} onSuccess={vi.fn()} />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /Submit application/i }));

    const button = await screen.findByRole('button', { name: /Submitting/i });
    expect(button).toBeDisabled();
    resolve(applicationCreated());
  });
});
