import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Receipt,
  BarChart2,
  ChevronRight,
  User,
  Building,
  type LucideIcon,
} from 'lucide-react';
import { useDashboardSummary } from '../hooks/useDashboard';
import { StatCard } from '../components/StatCard';
import { useAuthStore } from '../store/authStore';
import { isCompanyAdmin, isSuperAdmin } from '../lib/roles';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency, formatNumber } from '../utils/format';
import { Spinner } from '../components/Spinner';

interface NavAction {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const DashboardPage = () => {
  useDocumentTitle('Dashboard');
  const { data, error, isError, isFetching } = useDashboardSummary();
  const user = useAuthStore((s) => s.user);
  const tenant = data?.tenant;
  const stats = data?.stats;

  if (isFetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
        <span className="ml-2 text-ink-500">Loading dashboard…</span>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-8 text-sm text-red-600">
        {(error as Error)?.message ?? 'Failed to load dashboard'}
      </div>
    );
  }

  const revenue = formatCurrency(stats?.totalRevenue ?? 0);
  const active = stats?.activeUsers ?? 0;
  const limit = stats?.userLimit ?? '—';
  const usage = stats?.monthlyUsage ?? 0;
  const credits = stats?.monthlyCredits ?? 0;
  const usagePct = credits > 0 ? Math.min((usage / credits) * 100, 100) : 0;

  const actions: NavAction[] = [];
  if (isCompanyAdmin(user)) {
    actions.push({ label: 'Manage Team', to: '/team', icon: Users });
  }
  actions.push({ label: 'Profile', to: '/profile', icon: User });
  if (isSuperAdmin(user)) {
    actions.push({ label: 'Organizations', to: '/organizations', icon: Building });
  }

  const usageValue = `${formatNumber(usage)} / ${formatNumber(credits)}`;
  const usageSub = `${Math.round(usagePct)}%`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Dashboard</h1>
      </div>

      <p className="text-sm text-ink-500">
        Signed in as <span className="font-medium">{user?.name}</span> at{' '}
        <span className="font-medium">{tenant?.companyName}</span> on the{' '}
        <span className="font-medium">{tenant?.subscriptionPlan ?? 'free'}</span> plan.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Monthly Revenue" value={revenue} icon={<Receipt size={20} />} />
        <StatCard title="Active Users" value={formatNumber(active)} sub={`of ${String(limit)} limit`} icon={<Users size={20} />} />
        <StatCard
          title="Monthly Usage"
          value={usageValue}
          sub={usageSub}
          icon={<BarChart2 size={20} />}
        />
        <StatCard
          title="Subscription Plan"
          value={tenant?.subscriptionPlan ?? '—'}
          icon={<LayoutDashboard size={20} />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="card p-4 transition-shadow hover:shadow-card-lg flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <a.icon size={18} className="text-brand-600" />
              <span className="font-medium text-ink-900 dark:text-white">{a.label}</span>
            </div>
            <ChevronRight size={16} className="text-ink-400" />
          </Link>
        ))}
      </div>
    </motion.div>
  );
};

export default DashboardPage;