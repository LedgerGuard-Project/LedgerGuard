import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useLogin } from '../hooks/useAuth';
import { ApiError } from '../components/ApiError';
import { FormInput, FormField } from '../components/FormControls';
import { Spinner } from '../components/Spinner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { apiErrorMessage } from '../lib/api';
import type { LoginPayload } from '../services/auth.service';

/**
 * The platform tenant that owns the development/demo accounts. The login form
 * intentionally has no visible workspace field (email + password only), so this
 * value is sent alongside the credentials to satisfy the backend `login()`
 * handler, which requires a `tenantId` (or `companyName`).
 */
const DEFAULT_TENANT_ID = 'ledgerguard-platform';

/** Demo accounts surfaced on the login page (kept in sync with backend/seed.ts).
 * All demo accounts share the same "123456" password. Clicking any card
 * auto-fills AND submits a real backend login (never a fake frontend session). */
const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@ledgerguard.com', password: '123456' },
  { label: 'Manager', email: 'manager@ledgerguard.com', password: '123456' },
  { label: 'Viewer', email: 'viewer@ledgerguard.com', password: '123456' },
] as const;

export const LoginPage = () => {
  useDocumentTitle('Login');
  const location = useLocation();
  const navigate = useNavigate();
  const rawFrom = (location.state as { from?: unknown } | null)?.from;
  // Only accept a plain internal path string as a redirect target.
  const fromPath = typeof rawFrom === 'string' && rawFrom.startsWith('/') ? rawFrom : null;

  const [email, setEmail] = useState('admin@ledgerguard.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [demoExpanded, setDemoExpanded] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const login = useLogin();

  const [demoLoading, setDemoLoading] = useState<string | null>(null);

  const isSubmitting = login.isPending;
  const invalid = email.trim().length < 3 || password.length < 1;

  // Normal Sign In — submits the values currently in the form fields.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    login.mutate(
      { tenantId: DEFAULT_TENANT_ID, email, password } satisfies LoginPayload,
      {
        onSuccess: () => navigate(fromPath ?? '/dashboard', { replace: true }),
        onError: (err: unknown) => {
          // Technical details stay in the dev console; users see a friendly message.
          console.error('Login failed:', err);
          setSubmitError(apiErrorMessage(err, 'Sign in failed'));
        },
      },
    );
  };

  // Demo Quick Login — auto-fills AND submits the real backend request.
  const quickLogin = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(account.email);
    setPassword(account.password);
    setSubmitError('');
    setDemoLoading(account.label);
    login.mutate(
      { tenantId: DEFAULT_TENANT_ID, email: account.email, password: account.password } satisfies LoginPayload,
      {
        onSuccess: () => navigate(fromPath ?? '/dashboard', { replace: true }),
        onError: (err: unknown) => {
          console.error('Login failed:', err);
          setSubmitError(apiErrorMessage(err, 'Sign in failed'));
        },
        onSettled: () => setDemoLoading(null),
      },
    );
  };

    return (
    <div className="w-full">
      <h2 className="text-2xl font-bold text-ink-900 dark:text-white">Welcome Back</h2>
      <p className="mt-1 text-sm text-ink-500">Sign in to your LedgerGuard account</p>

      {submitError && <ApiError message={submitError} className="mt-3" />}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <FormField label="Email Address" htmlFor="email" hint="admin@ledgerguard.com" />
          <FormInput
            id="email"
            type="email"
            autoComplete="email"
            placeholder="admin@ledgerguard.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <FormField label="Password" htmlFor="password" />
          <div className="relative">
            <FormInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-400 transition-colors hover:text-ink-600 dark:hover:text-ink-200"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span />
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Forgot Password?
          </a>
        </div>

        <button type="submit" disabled={invalid || isSubmitting} className="btn btn-primary w-full">
          {isSubmitting ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <>
              Sign In
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      {/* Expandable Demo Credentials */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setDemoExpanded((v) => !v)}
          aria-expanded={demoExpanded}
          className="flex w-full items-center justify-between rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-left text-sm font-medium text-ink-700 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-200"
        >
          <span>🔑 Demo Credentials</span>
          <span className="text-xs text-ink-500 dark:text-ink-400">
            Quick Login for Testing {demoExpanded ? '▲' : '▼'}
          </span>
        </button>

        {demoExpanded && (
          <div className="mt-2 space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <div
                key={account.email}
                className="rounded-lg border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                    {account.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => quickLogin(account)}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    {demoLoading === account.label ? (
                      <>
                        <Spinner className="h-3.5 w-3.5" />
                        Logging in…
                      </>
                    ) : (
                      <>Login →</>
                    )}
                  </button>
                </div>
                <div className="mt-1 text-xs text-ink-500">
                  Email: <span className="break-all">{account.email}</span>
                </div>
                                <div className="mt-0.5 text-xs text-ink-500">
                  Password: <span className="font-mono">{account.password}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-ink-500">
        Don’t have an account?{' '}
        <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
          Register your organization
        </Link>
      </p>
    </div>
  );
};

export default LoginPage;