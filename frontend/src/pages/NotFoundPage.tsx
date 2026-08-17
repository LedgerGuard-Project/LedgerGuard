import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export const NotFoundPage = () => {
  useDocumentTitle('Not found');
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <motion.h1
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-7xl font-extrabold text-brand-600"
      >
        404
      </motion.h1>
      <h2 className="text-2xl font-bold text-ink-900 dark:text-white">Page not found</h2>
      <p className="max-w-md text-sm text-ink-500">
        The page you’re looking for doesn’t exist or you don’t have access.
      </p>
      <Link to="/dashboard" className="btn btn-primary">
        Go to dashboard
      </Link>
    </div>
  );
};

export default NotFoundPage;