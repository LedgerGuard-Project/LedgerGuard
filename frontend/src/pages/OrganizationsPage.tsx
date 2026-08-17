import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Power, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useTenants, useProvisionTenant, useUpdateTenant, useDisconnectTenant } from '../hooks/useTenants';
import { Badge } from '../components/DataState';
import { FormInput, FormSelect } from '../components/FormControls';
import { Spinner } from '../components/Spinner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuthStore } from '../store/authStore';
import { isSuperAdmin } from '../lib/roles';
import { SUBSCRIPTION_LABELS, SUBSCRIPTION_PLANS } from '@ledgerguard/shared';
import type { SubscriptionPlan, Tenant } from '@ledgerguard/shared';

const PLAN_OPTIONS = Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlan[];

export const OrganizationsPage = () => {
  useDocumentTitle('Organizations');
  const user = useAuthStore((s) => s.user);
  const canManage = isSuperAdmin(user);
  const { data, error, isError, isFetching, refetch } = useTenants();
  const create = useProvisionTenant();
  const update = useUpdateTenant();
  const disconnect = useDisconnectTenant();

  const tenants = data ?? [];
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    tenantId: '',
    companyName: '',
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
    subscriptionPlan: 'free',
  });

  const filtered = search
    ? tenants.filter(
        (t) =>
          t.companyName?.toLowerCase().includes(search.toLowerCase()) ||
          t.tenantId?.toLowerCase().includes(search.toLowerCase()),
      )
    : tenants;

  const resetForm = () =>
    setForm({
      tenantId: '',
      companyName: '',
      ownerName: '',
      ownerEmail: '',
      ownerPassword: '',
      subscriptionPlan: 'free',
    });

  const handleProvision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    create.mutate(form, {
      onSuccess: () => {
        resetForm();
        setShowForm(false);
        refetch();
      },
    });
  };

  const handleStatusToggle = (t: Tenant) => {
    if (!canManage) return;
    update.mutate({ id: t.tenantId, status: t.status === 'active' ? 'canceled' : 'active' });
    refetch();
  };

  const handleDisconnect = (t: Tenant) => {
    if (!canManage) return;
    if (window.confirm(`Disconnect ${t.tenantId}?`)) {
      disconnect.mutate(t.tenantId, { onSuccess: () => refetch() });
    }
  };

  const handlePlanChange = (t: Tenant, plan: SubscriptionPlan) => {
    if (!canManage) return;
    update.mutate({ id: t.tenantId, subscriptionPlan: plan });
    refetch();
  };

    return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Organizations</h1>
        {canManage && (
          <button onClick={() => setShowForm((v) => !v)} className="btn btn-primary">
            <Plus size={16} /> {showForm ? 'Cancel' : 'Add organization'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <motion.form
          layout
          onSubmit={handleProvision}
          className="grid gap-4 rounded-xl border border-ink-200 p-4 dark:border-ink-800 sm:grid-cols-2"
        >
          <FormInput placeholder="Tenant ID (lowercase)" value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required />
          <FormInput placeholder="Company name" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
          <FormInput placeholder="Owner full name" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} required />
          <FormInput type="email" placeholder="Owner email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} required />
          <FormInput type="password" placeholder="Owner password" value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} minLength={8} />
          <FormSelect value={form.subscriptionPlan} onChange={(e) => setForm({ ...form, subscriptionPlan: e.target.value as SubscriptionPlan })}>
            {PLAN_OPTIONS.map((p) => (
              <option key={p} value={p}>{SUBSCRIPTION_LABELS[p] ?? p}</option>
            ))}
          </FormSelect>
          <button type="submit" disabled={create.isPending} className="btn btn-ghost sm:col-span-2 justify-self-start">
            {create.isPending ? <Spinner className="h-4 w-4" /> : 'Provision tenant'}
          </button>
          {create.isError && (
            <p className="sm:col-span-2 text-sm text-red-600">
              {(create.error as { message?: string } | undefined)?.message ?? 'Failed to provision tenant'}
            </p>
          )}
        </motion.form>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input className="input pl-9" placeholder="Search organizations..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isFetching ? (
        <div className="py-8 text-center text-ink-500">
          <Spinner />
          <span className="ml-2">Loading organizations…</span>
        </div>
      ) : isError ? (
        <div className="py-8 text-center text-sm text-red-600">
          {(error as Error)?.message ?? 'Failed to load tenants'}
        </div>
            ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-500">
          {search ? 'No matching organizations.' : 'No organizations yet.'}
        </div>
      ) : (
              <div className="space-y-3">
          {filtered.map((t) => (
            <motion.div key={t.tenantId} layout className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink-900 dark:text-white">{t.companyName}</p>
                  <p className="text-xs text-ink-500">tenant · {t.tenantId}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      t.status === 'active'
                        ? 'success'
                        : t.status === 'canceled'
                          ? 'warning'
                          : 'default'
                    }
                  >
                    {t.status}
                  </Badge>
                  {canManage && (
                    <button
                      onClick={() => setExpanded(expanded === t.tenantId ? null : t.tenantId)}
                      className="rounded p-1 text-ink-400 hover:text-ink-700"
                    >
                      {expanded === t.tenantId ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                </div>
              </div>

              {canManage && expanded === t.tenantId && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 border-t border-ink-200 pt-3 dark:border-ink-800"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-ink-500">Plan</p>
                      <FormSelect
                        value={(t.subscriptionPlan as string) ?? ''}
                        onChange={(e) => handlePlanChange(t, e.target.value as SubscriptionPlan)}
                        className="mt-1"
                      >
                        {PLAN_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {SUBSCRIPTION_LABELS[p] ?? p}
                          </option>
                        ))}
                      </FormSelect>
                    </div>
                    <div>
                      <p className="text-xs text-ink-500">Status</p>
                      <button
                        onClick={() => handleStatusToggle(t)}
                        className="btn btn-secondary mt-1"
                      >
                        <Power size={14} />
                        {t.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        onClick={() => handleDisconnect(t)}
                        disabled={disconnect.isPending && disconnect.variables === t.tenantId}
                        className="btn btn-secondary"
                      >
                        {disconnect.isPending && disconnect.variables === t.tenantId ? (
                          <Spinner className="h-4 w-4" />
                        ) : null}
                        Disconnect database
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default OrganizationsPage;