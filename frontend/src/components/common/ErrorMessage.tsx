import type { ApiError } from '@/api/client';
import { Button } from './Button';

interface ErrorMessageProps {
  error: ApiError | Error | null;
  onRetry?: () => void;
  title?: string;
}

/**
 * One error presentation for the whole app. When the failure came from the API
 * it also shows the request id, which is the exact value to search for in
 * CloudWatch Logs Insights.
 */
export function ErrorMessage({ error, onRetry, title = 'Something went wrong' }: ErrorMessageProps) {
  if (!error) return null;
  const requestId = (error as ApiError).requestId;

  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm">
      <p className="font-semibold text-red-900">{title}</p>
      <p className="mt-1 text-red-800">{error.message}</p>
      {requestId && <p className="mt-2 font-mono text-xs text-red-700">Request ID: {requestId}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  );
}
