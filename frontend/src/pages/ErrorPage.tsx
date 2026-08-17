import { motion } from 'framer-motion';
import { Link, useRouteError } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export const ErrorPage = () => {
  useDocumentTitle('Something went wrong');
  const error = useRouteError();
  const message =
    (error instanceof Error && error.message) ||
    (typeof error === 'string' ? error : null) ||
    'An unexpected error occurred. Please try again.';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ink-50 p-6 text-center dark:bg-ink-950">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card w-full max-w-md p-8"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertTriangle size={24} />
        </div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Something went wrong</h1>
        <p className="mt-2 break-words text-sm text-ink-500">{message}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button onClick={() => window.location.reload()} className="btn btn-primary">
            <RefreshCw size={16} /> Reload
          </button>
          <Link to="/" className="btn btn-secondary">
            Go home
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default ErrorPage;