import { Outlet, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { canAct } from '../lib/roles';
import { UserRole } from '@ledgerguard/shared';
import {
  LayoutDashboard,
  Users,
  Building,
  Settings,
  User,
  Menu,
  Receipt,
  Bell,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { UserMenu } from '../components/UserMenu';
import { ThemeToggle } from '../components/ThemeToggle';
import { Logo } from '../components/Logo';
import { cn } from '../lib/utils';

interface NavItem {
  name: string;
  to: string;
  icon: LucideIcon;
  roles: UserRole[];
}

function buildNav(role: UserRole | undefined): NavItem[] {
    const items: NavItem[] = [
    { name: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles: [] },
        { name: 'Billing', to: '/billing', icon: Receipt, roles: [] },
        { name: 'Reconciliation', to: '/billing/reconciliation', icon: Scale, roles: [UserRole.FinanceManager] },
    { name: 'Notifications', to: '/billing/notifications', icon: Bell, roles: [] },
    { name: 'Team', to: '/team', icon: Users, roles: [UserRole.CompanyAdmin] },
    { name: 'Organizations', to: '/organizations', icon: Building, roles: [UserRole.SuperAdmin] },
    { name: 'Profile', to: '/profile', icon: User, roles: [] },
    { name: 'Settings', to: '/settings', icon: Settings, roles: [] },
  ];
  return items.filter((it) => it.roles.length === 0 || (role && canAct(role, it.roles[0])));
}

const BottomNav = ({ items }: { items: NavItem[] }) => {
  const location = useLocation();
  const visible = items.slice(0, 4);
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-ink-200 bg-white/80 backdrop-blur dark:border-ink-800 dark:bg-ink-900/80">
      <div className="flex items-center justify-around py-1.5">
        {visible.map((it) => {
          const Icon = it.icon;
          const active = location.pathname === it.to;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium',
                active
                  ? 'text-brand-700'
                  : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white',
              )}
            >
              <Icon size={20} className={active ? 'text-brand-600' : undefined} />
              {it.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const role = useAuthStore((s) => s.user?.role);
  const tenant = useAuthStore((s) => s.tenant);
  const nav = buildNav(role);
  const location = useLocation();

  const SidebarContent = () => (
    <div className="flex h-full w-64 flex-col overflow-y-auto p-4">
      <div className="flex items-center gap-2 px-2 py-4">
        <Logo className="h-8 w-8" />
        <span className="text-lg font-bold text-ink-900 dark:text-white">LedgerGuard</span>
      </div>
      {tenant && (
        <div className="px-4 py-2">
          <p className="text-xs text-ink-500">Organization</p>
          <p className="text-sm font-semibold text-ink-900 dark:text-white">
            {tenant.companyName}
          </p>
        </div>
      )}
      <nav className="mt-4 flex flex-col gap-1">
        {nav.map((it) => {
          const Icon = it.icon;
          const active = location.pathname === it.to;
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'nav-link',
                active ? 'nav-link-active' : '',
                'items-center',
              )}
            >
              <Icon size={18} />
              {it.name}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-ink-200 dark:border-ink-800 p-4 space-y-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:block md:w-64 md:shrink-0 md:overflow-y-auto md:border-r md:border-ink-200 md:bg-white dark:md:border-ink-800 dark:md:bg-ink-950">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div
            className="h-full w-64 -translate-x-0 bg-white dark:bg-ink-950 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-ink-200 bg-white px-4 dark:border-ink-800 dark:bg-ink-950">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden rounded-lg p-2 text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <span className="hidden sm:block text-sm font-medium text-ink-600 dark:text-ink-300">
              {nav.find((n) => n.to === location.pathname)?.name ?? 'Dashboard'}
            </span>
          </div>
                    <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">
          <Outlet />
        </main>
      </div>
            <BottomNav items={nav} />
    </div>
  );
};
