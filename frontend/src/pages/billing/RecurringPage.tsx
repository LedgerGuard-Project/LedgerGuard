import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pause, Play, RefreshCw, Calendar } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { DataState } from '../../components/DataState';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import {
  useRecurringPlans,
  useCreateRecurringPlan,
  useUpdateRecurringPlan,
  useSetRecurringPlanStatus,
  useRunRecurringSweep,
  useCustomers,
  useRecurringPreview,
} from '../../hooks/useBilling';
import { formatMinor } from '../../utils/format';
import type { RecurringPlan, RecurringStatus } from '../../types/billing';

export const RecurringPage = () => {
  useDocumentTitle('Recurring Billing');
  const { data: plansData, error, isError, isFetching } = useRecurringPlans();
  const { data: customersData } = useCustomers({ status: 'active' });
  const customers = customersData?.items ?? [];
  const plans = plansData?.items ?? [];
  const [modalOpen, setModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPlanId, setPreviewPlanId] = useState('');
  const [editingPlan, setEditingPlan] = useState<RecurringPlan | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const createMutation = useCreateRecurringPlan();
  const updateMutation = useUpdateRecurringPlan();
  const setRecurringStatus = useSetRecurringPlanStatus();
  const sweepMutation = useRunRecurringSweep();

  const openCreate = () => {
    setEditingPlan(null);
    setForm({
      customerId: '', name: '', description: '', amount: '',
      interval: 'monthly', intervalCount: 1, startDate: '',
      invoiceStatus: 'draft', autoGenerate: true,
    });
    setModalOpen(true);
  };

  const openEdit = (plan: RecurringPlan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name, description: plan.description ?? '',
      amount: plan.amountMinor / 100, interval: plan.interval,
      intervalCount: plan.intervalCount, startDate: plan.startDate.slice(0, 10),
      endDate: plan.endDate?.slice(0, 10) ?? '', invoiceStatus: plan.invoiceStatus,
      autoGenerate: plan.autoGenerate,
    });
    setModalOpen(true);
  };

  const openPreview = (planId: string) => { setPreviewPlanId(planId); setPreviewOpen(true); };

  const handleSubmit = async () => {
    try {
      if (editingPlan) {
        await updateMutation.mutateAsync({ id: editingPlan.planId, input: form });
      } else {
        await createMutation.mutateAsync(form);
      }
      setModalOpen(false);
    } catch {}
  };

  const handleRunSweep = async () => {
    try { await sweepMutation.mutateAsync(); } catch {}
  };

  const handleStatusChange = async (plan: RecurringPlan, newStatus: RecurringStatus) => {
    try { await setRecurringStatus.mutateAsync({ id: plan.planId, status: newStatus }); } catch {}
  };

  
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Recurring Billing</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunSweep}
            className="flex items-center gap-2 rounded-md border border-ink-300 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-900/50"
          >
            <RefreshCw size={16} />
            Run Sweep
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus size={16} />
            New Plan
          </button>
        </div>
      </div>

      <DataState isLoading={isFetching} isError={isError} error={error} empty={plans.length === 0} emptyMessage="No recurring plans yet.">
        <div className="overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-900">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Plan</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Customer</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-ink-600 dark:text-ink-300">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Interval</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Next Billing</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Status</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-600 dark:text-ink-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.planId} className="border-t border-ink-200 dark:border-ink-800 last:border-0">
                  <td className="px-4 py-2.5 align-top">
                    <div className="font-medium text-ink-900 dark:text-white">{plan.name}</div>
                    <div className="text-xs text-ink-500">{plan.description}</div>
                  </td>
                  <td className="px-4 py-2.5 align-top">{plan.customerName ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right align-top">{formatMinor(plan.amountMinor, plan.currency)}</td>
                  <td className="px-4 py-2.5 align-top capitalize">
                    {plan.interval} × {plan.intervalCount}
                  </td>
                  <td className="px-4 py-2.5 align-top">{plan.nextBillingDate.slice(0, 10)}</td>
                  <td className="px-4 py-2.5 align-top">
                    <StatusBadge status={plan.status} />
                  </td>
                  <td className="px-4 py-2.5 align-top text-center space-x-1">
                    <button
                      onClick={() => openPreview(plan.planId)}
                      className="inline-block rounded p-1 text-ink-500 hover:bg-ink-100"
                      title="Preview"
                    >
                      <Calendar size={14} />
                    </button>
                    <button
                      onClick={() => openEdit(plan)}
                      className="inline-block rounded p-1 text-ink-500 hover:bg-ink-100"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    {plan.status === 'active' && (
                      <button
                        onClick={() => handleStatusChange(plan, 'paused')}
                        className="inline-block rounded p-1 text-amber-600 hover:bg-amber-50"
                        title="Pause"
                      >
                        <Pause size={14} />
                      </button>
                    )}
                    {plan.status === 'paused' && (
                      <button
                        onClick={() => handleStatusChange(plan, 'active')}
                        className="inline-block rounded p-1 text-green-600 hover:bg-green-50"
                        title="Resume"
                      >
                        <Play size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>

      {modalOpen && (
        <Modal
          open={modalOpen}
          title={editingPlan ? 'Edit Recurring Plan' : 'New Recurring Plan'}
          onClose={() => setModalOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="btn btn-ghost">
                Cancel
              </button>
              <button onClick={handleSubmit} className="btn btn-primary">
                {editingPlan ? 'Save' : 'Create'}
              </button>
            </div>
          }
          size="lg"
        >
          <RecurringPlanForm
            form={form}
            setForm={setForm}
            customers={customers}
            editing={Boolean(editingPlan)}
          />
        </Modal>
      )}

      {previewOpen && previewPlanId && (
        <Modal
          open={previewOpen}
          title="Next Invoice Preview"
          onClose={() => setPreviewOpen(false)}
          size="lg"
        >
          <RecurringPreviewContent planId={previewPlanId} />
        </Modal>
      )}
    </motion.div>
  );
};




function RecurringPlanForm({ form, setForm, customers, editing }: {
  form: Record<string, unknown>;
  setForm: (f: Record<string, unknown>) => void;
  customers: Array<{ customerId: string; name: string }>;
  editing: boolean;
}) {
  const update = (field: string, value: unknown) => setForm({ ...form, [field]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {!editing && (
        <div>
          <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Customer</label>
          <select
            value={String(form.customerId ?? '')}
            onChange={(e) => update('customerId', e.target.value)}
            className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
          >
            <option value="">Select a customer</option>
            {customers.map((c) => (
              <option key={c.customerId} value={c.customerId}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Name</label>
        <input
          type="text" value={String(form.name ?? '')}
          onChange={(e) => update('name', e.target.value)}
          className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Description</label>
        <input
          type="text" value={String(form.description ?? '')}
          onChange={(e) => update('description', e.target.value)}
          className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Amount</label>
        <input
          type="number" min="0" step="0.01" value={String(form.amount ?? '')}
          onChange={(e) => update('amount', Number(e.target.value) * 100)}
          className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Interval</label>
        <select
          value={String(form.interval ?? 'monthly')}
          onChange={(e) => update('interval', e.target.value)}
          className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
        >
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="yearly">Yearly</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Interval Count</label>
        <input
          type="number" min="1" value={String(form.intervalCount ?? 1)}
          onChange={(e) => update('intervalCount', Number(e.target.value))}
          className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Start Date</label>
        <input
          type="date" value={String(form.startDate ?? '')}
          onChange={(e) => update('startDate', e.target.value)}
          className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">End Date (optional)</label>
        <input
          type="date" value={String(form.endDate ?? '')}
          onChange={(e) => update('endDate', e.target.value || undefined)}
          className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Invoice Status</label>
        <select
          value={String(form.invoiceStatus ?? 'draft')}
          onChange={(e) => update('invoiceStatus', e.target.value)}
          className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
        >
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
        </select>
      </div>
      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox" checked={Boolean(form.autoGenerate)}
            onChange={(e) => update('autoGenerate', e.target.checked)}
            className="h-4 w-4 rounded border-ink-400 text-brand-600 focus:ring-brand-500"
          />
          Auto-generate invoices
        </label>
      </div>
    </div>
  );
}

function RecurringPreviewContent({ planId }: { planId: string }) {
  const { data: previewData, isLoading, isError, error } = useRecurringPreview(planId);
  const preview = previewData?.preview;
  if (isLoading) {
    return <div className="py-8 text-center text-sm text-ink-500">Loading preview…</div>;
  }
  if (isError || !preview) {
    return <div className="py-4 text-sm text-red-600">{(error as { message?: string } | undefined)?.message ?? 'Could not load preview.'}</div>;
  }
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-ink-500">Invoice Number</div>
        <div className="font-medium text-ink-900 dark:text-white">{preview.invoiceNumber}</div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-ink-500">Amount</div>
          <div className="font-medium text-ink-900 dark:text-white">{formatMinor(preview.amountMinor, preview.currency)}</div>
        </div>
        <div>
          <div className="text-sm text-ink-500">Issue Date</div>
          <div className="font-medium text-ink-900 dark:text-white">{preview.issueDate.slice(0, 10)}</div>
        </div>
        <div>
          <div className="text-sm text-ink-500">Due Date</div>
          <div className="font-medium text-ink-900 dark:text-white">{preview.dueDate.slice(0, 10)}</div>
        </div>
        <div>
          <div className="text-sm text-ink-500">Currency</div>
          <div className="font-medium text-ink-900 dark:text-white">{preview.currency}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ink-50 dark:bg-ink-900">
              <th className="px-3 py-1.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Description</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-ink-600 dark:text-ink-300">Qty</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-ink-600 dark:text-ink-300">Unit Price</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-ink-600 dark:text-ink-300">Total</th>
            </tr>
          </thead>
          <tbody>
            {preview.items.map((item, i) => (
              <tr key={i} className="border-t border-ink-200 dark:border-ink-800">
                <td className="px-3 py-1.5">{item.description}</td>
                <td className="px-3 py-1.5 text-right">{item.quantity}</td>
                <td className="px-3 py-1.5 text-right">{formatMinor(item.unitPriceMinor, preview.currency)}</td>
                <td className="px-3 py-1.5 text-right">{formatMinor(item.amountMinor, preview.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RecurringPage;
