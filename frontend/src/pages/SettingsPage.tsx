import { motion } from 'framer-motion';
import { useState } from 'react';
import { Save } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useUpdateTenant } from '../hooks/useTenants';
import { ThemeToggle } from '../components/ThemeToggle';
import { FormSelect } from '../components/FormControls';
import { Spinner } from '../components/Spinner';
import { SUBSCRIPTION_LABELS, SUBSCRIPTION_PLANS } from '@ledgerguard/shared';
import type { SubscriptionPlan } from '@ledgerguard/shared';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';

const PLAN_OPTIONS = Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlan[];

export const SettingsPage = () => {
  useDocumentTitle('Settings');
  const tenant = useAuthStore((s) => s.tenant);
  const [plan, setPlan] = useState<SubscriptionPlan>(
    (tenant?.subscriptionPlan as SubscriptionPlan | undefined) ?? 'free',
  );
  const update = useUpdateTenant();

  if (!tenant) {
    return <div className="py-8 text-sm text-ink-500">No tenant context available.</div>;
  }

  const planChanged = plan !== tenant.subscriptionPlan;
  const handleSavePlan = () => {
    if (!planChanged) return;
    update.mutate({ id: tenant.tenantId, subscriptionPlan: plan });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Settings</h1>
      </div>

      <motion.div className="card p-6" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <h3 className="mb-4 text-sm font-medium text-ink-600 uppercase dark:text-ink-300">
          Appearance
        </h3>
        <p className="mb-3 text-sm text-ink-500">Choose a light or dark theme.</p>
        <ThemeToggle />
      </motion.div>

      <motion.div className="card p-6" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h3 className="mb-4 text-sm font-medium text-ink-600 uppercase dark:text-ink-300">
          Subscription
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-ink-500">Current plan</p>
            <p className="text-sm font-semibold text-ink-900 dark:text-white">
              {SUBSCRIPTION_LABELS[tenant.subscriptionPlan as string] ?? tenant.subscriptionPlan}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-500">Status</p>
            <p className="text-sm font-semibold text-ink-900 dark:text-white">{tenant.status}</p>
          </div>
        </div>

        <div className="mt-4">
          <label className="label">Change plan</label>
          <FormSelect value={plan} onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}>
            {PLAN_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {SUBSCRIPTION_LABELS[p] ?? SUBSCRIPTION_PLANS[p].label}
              </option>
            ))}
          </FormSelect>
        </div>

        {planChanged && (
          <button
            onClick={handleSavePlan}
            disabled={update.isPending}
            className={cn('btn btn-primary mt-3', 'ml-auto flex')}
          >
            {update.isPending ? <Spinner className="h-4 w-4" /> : <Save size={16} />}
            Save
          </button>
        )}
        {update.isSuccess && (
          <p className="mt-2 text-xs text-green-700">Plan updated successfully.</p>
        )}
        {update.isError && (
          <p className="mt-2 text-xs text-red-600">Failed to update plan.</p>
        )}
      </motion.div>
    </motion.div>
  );
};

export default SettingsPage;