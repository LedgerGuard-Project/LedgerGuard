import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useLogout } from '../hooks/useAuth';
import { ChevronDown, LogOut, Settings, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { roleLabel } from '../lib/roles';



export const UserMenu = () => {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const logout = useLogout();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  const handleLogout = useCallback(() => {
    setOpen(false);
    logout.mutate(undefined);
  }, [logout]);

  if (!user || !tenant) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
      >
        <span className="hidden sm:inline">{user.name}</span>
        <ChevronDown size={14} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-ink-200 bg-white shadow-card-lg dark:border-ink-700 dark:bg-ink-900"
          >
            <div className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                  {user.name?.charAt(0)?.toUpperCase() ?? 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900 dark:text-white">{user.name}</p>
                  <p className="truncate text-xs text-ink-500">{user.email}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {roleLabel(user.role)} · {tenant.companyName}
                  </p>
                </div>
              </div>
            </div>
            <div className="border-t border-ink-200 dark:border-ink-700 py-1">
              <Link
                to="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800"
              >
                <User size={16} /> Profile
              </Link>
              <Link
                to="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800"
              >
                <Settings size={16} /> Settings
              </Link>
            </div>
            <div className="border-t border-ink-200 dark:border-ink-700 py-1">
              <button
                onClick={handleLogout}
                disabled={logout.isPending}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800"
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};