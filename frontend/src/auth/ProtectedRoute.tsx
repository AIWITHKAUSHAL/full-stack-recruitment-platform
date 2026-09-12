import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useAuth } from './useAuth';

/**
 * Gate in front of every /admin route.
 *
 * This is a usability measure, not a security control: the real protection is
 * the `get_current_admin` dependency on the backend. Hiding a page in React
 * would be meaningless on its own, because the API is what holds the data.
 */
export function ProtectedRoute() {
  const { admin, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <LoadingSpinner label="Checking your session…" />;
  if (!admin) return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}
