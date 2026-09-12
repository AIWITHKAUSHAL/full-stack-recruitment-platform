import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { adminApi } from '@/api/admin';
import { getStoredToken, setStoredToken } from '@/api/client';
import type { AdminProfile } from '@/types/api';
import { AuthContext } from './context';

/**
 * Admin session state.
 *
 * The JWT lives in localStorage, but it is never *trusted* on its own: on every
 * page load the token is verified against `/admin/auth/me`, so a deactivated
 * account or an expired token results in a login redirect rather than a broken
 * console. Authorisation is always decided by the server.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [initialising, setInitialising] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!getStoredToken()) {
      setInitialising(false);
      return;
    }
    adminApi
      .me()
      .then((profile) => {
        if (!cancelled) setAdmin(profile);
      })
      .catch(() => {
        setStoredToken(null);
        if (!cancelled) setAdmin(null);
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const token = await adminApi.login(email, password);
    setStoredToken(token.access_token);
    setAdmin(await adminApi.me());
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({ admin, initialising, login, logout }),
    [admin, initialising, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
