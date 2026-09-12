import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthState } from '@/auth/context';
import type { AdminProfile } from '@/types/api';

export const testAdmin: AdminProfile = {
  id: 1,
  email: 'admin@example.com',
  full_name: 'Test Admin',
  is_active: true,
};

interface Options {
  route?: string;
  auth?: Partial<AuthState>;
}

/**
 * Renders a component inside the providers it expects: a router (every page
 * uses Link or useSearchParams) and an auth context whose state the test
 * controls directly, so no login round trip is needed.
 */
export function renderWithProviders(ui: ReactElement, { route = '/', auth }: Options = {}) {
  const value: AuthState = {
    admin: null,
    initialising: false,
    login: async () => {},
    logout: () => {},
    ...auth,
  };

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </MemoryRouter>
  );

  return render(ui, { wrapper: Wrapper });
}
