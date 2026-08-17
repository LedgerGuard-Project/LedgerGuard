import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRegister } from '../hooks/useAuth';
import { ApiError } from '../components/ApiError';
import { FormInput, FormSelect, FormField } from '../components/FormControls';
import { Spinner } from '../components/Spinner';
import { SUBSCRIPTION_LABELS, SUBSCRIPTION_PLANS } from '@ledgerguard/shared';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { SubscriptionPlan } from '@ledgerguard/shared';

const PLAN_OPTIONS = Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlan[];

export const RegisterPage = () => {
  useDocumentTitle('Register');
  const [companyName, setCompanyName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan>('free');
  const [submitError, setSubmitError] = useState('');
  const register = useRegister();

  const isSubmitting = register.isPending;
  const invalid =
    !companyName.trim() ||
    !name.trim() ||
    !email.trim() ||
    password.length < 8 ||
    password !== confirm;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (invalid) {
      setSubmitError('Please review the form. Passwords must match and be at least 8 characters.');
      return;
    }
    register.mutate(
      {
        companyName,
        tenantId: tenantId || undefined,
        name,
        email,
        password,
        subscriptionPlan: plan,
      },
      {
        onError: (err: unknown) => {
          const msg = (err as { message?: string } | undefined)?.message ?? 'Registration failed';
          setSubmitError(msg);
        },
      },
    );
  };

  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold text-ink-900 dark:text-white">Create your organization</h2>
      <p className="mt-1 text-sm text-ink-500">
        Set up a company workspace and your first admin account.
      </p>

      {submitError && <ApiError message={submitError} className="mt-3" />}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <FormField label="Company name" htmlFor="companyName" hint="Your organization's legal name" />
          <FormInput
            id="companyName"
            placeholder="Acme Inc."
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />
        </div>
        <div>
          <FormField label="Workspace ID" htmlFor="tenantId" hint="Optional — auto-generated if blank" />
          <FormInput
            id="tenantId"
            placeholder="acme"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value.trim().toLowerCase())}
          />
        </div>
        <div>
          <FormField label="Full name" htmlFor="name" />
          <FormInput
            id="name"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <FormField label="Email" htmlFor="email" />
          <FormInput
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <FormField label="Password" htmlFor="password" hint="At least 8 characters" />
          <FormInput
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <FormField label="Confirm password" htmlFor="confirm" />
          <FormInput
            id="confirm"
            type="password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <FormField label="Subscription plan" htmlFor="plan" />
                    <FormSelect id="plan" value={plan} onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}>
            {PLAN_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {SUBSCRIPTION_LABELS[p] ?? SUBSCRIPTION_PLANS[p].label}
              </option>
            ))}
          </FormSelect>
        </div>

        <button
          type="submit"
          disabled={invalid || isSubmitting}
          className="btn btn-primary w-full"
        >
          {isSubmitting ? <Spinner className="h-4 w-4" /> : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Already have a workspace?{' '}
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </div>
  );
};

export default RegisterPage;