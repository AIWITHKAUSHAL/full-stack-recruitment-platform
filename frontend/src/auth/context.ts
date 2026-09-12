import { createContext } from 'react';
import type { AdminProfile } from '@/types/api';

export interface AuthState {
  admin: AdminProfile | null;
  /** true until the stored token has been checked against the API */
  initialising: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

// The context lives in its own module so AuthProvider.tsx exports only a
// component, which is what keeps React Fast Refresh working.
export const AuthContext = createContext<AuthState | null>(null);
