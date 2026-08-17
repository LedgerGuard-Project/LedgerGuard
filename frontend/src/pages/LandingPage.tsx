import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart, Users, Shield, Zap } from 'lucide-react';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuthStore } from '../store/authStore';

const features = [
  { icon: BarChart, title: 'Real-time dashboards', desc: 'Live metrics for revenue and tenant health.' },
  { icon: Users, title: 'Role-based access', desc: 'Granular permissions from Viewer to Super Admin.' },
  { icon: Shield, title: 'Audit trail', desc: 'Every action is logged with actor and IP.' },
  { icon: Zap, title: 'Multi-tenant', desc: 'Isolated databases per organization, auto-provisioned.' },
];

function AppFooter() {
  return (
    <footer className="border-t border-ink-200 py-6 dark:border-ink-800">
      <div className="container mx-auto flex flex-col items-center justify-between gap-3 text-sm text-ink-500">
        <p>© {new Date().getFullYear()} LedgerGuard. All rights reserved.</p>
        <div className="flex gap-4">
          <Link to="/login" className="hover:text-ink-900 dark:hover:text-white">Login</Link>
          <Link to="/register" className="hover:text-ink-900 dark:hover:text-white">Register</Link>
        </div>
      </div>
    </footer>
  );
}

export const LandingPage = () => {
  useDocumentTitle('LedgerGuard');
  const accessToken = useAuthStore((s) => s.accessToken);

  return (
    <div className="min-h-screen bg-gradient-to-b from-ink-50 to-white dark:from-ink-950 dark:to-ink-950">
      <header className="container mx-auto flex h-16 items-center justify-between px-4">
        <Logo className="h-9 w-9" />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {accessToken ? (
            <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">Login</Link>
              <Link to="/register" className="btn btn-primary">Get started</Link>
            </>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <section className="text-center">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-balance text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl"
          >
            Financial operations, tenant by tenant.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4 text-balance text-lg text-ink-500"
          >
            LedgerGuard is the secure, multi-tenant platform for billing, dashboards,
            and role-based financial operations.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-8 flex justify-center gap-3"
          >
            {accessToken ? (
              <Link to="/dashboard" className="btn btn-primary">
                Open Dashboard <ArrowRight size={16} />
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary">
                  Start free trial
                </Link>
                <Link to="/login" className="btn btn-secondary">
                  Sign in
                </Link>
              </>
            )}
          </motion.div>
        </section>

        <section className="mx-auto mt-16 grid w-full max-w-3xl gap-6 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 + 0.2 }}
                className="card p-6 text-center"
              >
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                  <Icon size={20} />
                </div>
                <h3 className="font-semibold text-ink-900 dark:text-white">{f.title}</h3>
                <p className="mt-1.5 text-sm text-ink-500">{f.desc}</p>
              </motion.div>
            );
          })}
        </section>
      </main>

      <AppFooter />
    </div>
  );
};

export default LandingPage;