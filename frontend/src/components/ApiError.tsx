import type { FC } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export const ApiError: FC<{ message?: string; className?: string }> = ({
  message,
  className,
}) => {
  if (!message) return null;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800',
        className,
      )}
    >
      <AlertCircle size={16} />
      <span>{message}</span>
    </div>
  );
};

export const ApiErrorBoundary: FC<{ error: Error | null; className?: string }> = ({
  error,
  className,
}) => {
  if (!error) return null;
  return <ApiError message={error.message} className={className} />;
};

export default ApiError;