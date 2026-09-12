import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, toApiError } from '@/api/client';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/common/Button';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { TextField } from '@/components/common/FormField';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function AdminLoginPage() {
  useDocumentTitle('Admin sign in');

  const { admin, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  if (admin) return <Navigate to={from} replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              MJB
            </span>
            <span className="text-left text-sm font-semibold leading-tight text-slate-900">
              Mini Job Board
              <span className="block text-xs font-normal text-slate-500">Application Tracker</span>
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">Admin sign in</h1>
          <p className="mt-2 text-sm text-slate-600">Manage jobs and review candidate applications.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="card mt-8 space-y-5 p-6 sm:p-8">
          {error && <ErrorMessage error={error} title="Sign in failed" />}

          <TextField
            label="Email address"
            required
            type="email"
            autoComplete="username"
            placeholder="admin@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label="Password"
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" size="lg" loading={loading} className="w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Administrator access only. Candidates can{' '}
          <Link to="/track" className="font-medium text-brand-600 hover:underline">
            track an application
          </Link>{' '}
          without signing in.
        </p>
      </div>
    </div>
  );
}
