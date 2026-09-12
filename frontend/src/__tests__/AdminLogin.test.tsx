import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminLoginPage from '@/pages/AdminLoginPage';
import { ApiError } from '@/api/client';
import { renderWithProviders, testAdmin } from '@/test/render';

describe('AdminLoginPage', () => {
  it('submits the credentials to the auth context', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<AdminLoginPage />, { route: '/admin/login', auth: { login } });

    await user.type(screen.getByLabelText(/Email address/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/Password/i), 'TestAdminPassword123!');
    await user.click(screen.getByRole('button', { name: /^Sign in$/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('admin@example.com', 'TestAdminPassword123!'));
  });

  it('shows the server error for bad credentials', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue(
      new ApiError('Incorrect email address or password.', 'UNAUTHORIZED', 401),
    );
    renderWithProviders(<AdminLoginPage />, { route: '/admin/login', auth: { login } });

    await user.type(screen.getByLabelText(/Email address/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/Password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /^Sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email address or password.');
  });

  it('uses a password input so the value is masked', () => {
    renderWithProviders(<AdminLoginPage />, { route: '/admin/login' });
    expect(screen.getByLabelText(/Password/i)).toHaveAttribute('type', 'password');
  });

  it('redirects an already signed-in administrator away from the login page', () => {
    renderWithProviders(<AdminLoginPage />, { route: '/admin/login', auth: { admin: testAdmin } });
    expect(screen.queryByRole('button', { name: /^Sign in$/i })).not.toBeInTheDocument();
  });
});
