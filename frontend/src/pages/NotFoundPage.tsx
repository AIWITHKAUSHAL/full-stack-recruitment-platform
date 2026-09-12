import { LinkButton } from '@/components/common/Button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <p className="text-5xl font-bold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        The page you were looking for does not exist, or it has moved.
      </p>
      <div className="mt-8 flex gap-3">
        <LinkButton to="/">Go home</LinkButton>
        <LinkButton to="/jobs" variant="secondary">
          Browse roles
        </LinkButton>
      </div>
    </div>
  );
}
