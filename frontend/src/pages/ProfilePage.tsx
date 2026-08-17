import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Mail, Calendar, Shield, Briefcase, Pencil } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { roleLabel } from '../lib/roles';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatDate } from '../utils/format';

const detail = (icon: ReactNode, label: string, value: ReactNode) => (
  <div className="flex items-center gap-3 py-2.5">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
      {icon}
    </span>
    <div>
      <p className="text-xs font-medium text-ink-500 uppercase">{label}</p>
      <p className="text-sm font-medium text-ink-900 dark:text-white">{value ?? '—'}</p>
    </div>
  </div>
);

export const ProfilePage = () => {
  useDocumentTitle('Profile');
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const displayName = user?.name ?? user?.email ?? 'Account';

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Profile</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="md:col-span-1 card p-6 text-center"
        >
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-3xl font-bold">
            {displayName.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">{displayName}</h2>
          <p className="text-sm text-ink-500">{user?.email}</p>
          <span
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700"
          >
            <Shield size={12} /> {roleLabel(user?.role)}
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="md:col-span-2 card p-6"
        >
          {detail(<Pencil size={18} />, 'Full Name', user?.name)}
          {detail(<Mail size={18} />, 'Email', user?.email)}
          {detail(<Shield size={18} />, 'Role', roleLabel(user?.role))}
          {detail(<Briefcase size={18} />, 'Status', user?.status)}
          {detail(<Calendar size={18} />, 'Last Login', formatDate(user?.lastLoginAt ?? ''))}
          {detail(<Calendar size={18} />, 'Member Since', formatDate(user?.createdAt ?? ''))}
        </motion.div>
      </div>

      {tenant && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card p-6"
        >
          <h3 className="mb-3 text-sm font-medium text-ink-600 uppercase dark:text-ink-300">
            Organization
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-ink-500">Company</p>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">
                {tenant.companyName}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Workspace ID</p>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">
                {tenant.tenantId}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Subscription</p>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">
                {tenant.subscriptionPlan}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Status</p>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">
                {tenant.status}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default ProfilePage;