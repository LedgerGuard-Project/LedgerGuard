import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { DataState } from '../../components/DataState';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { useTaxRates, useCreateTaxRate, useUpdateTaxRate, useSetTaxRateActive } from '../../hooks/useBilling';
import type { TaxRate } from '../../types/billing';

export const TaxSettingsPage = () => {
  useDocumentTitle('Tax Rates');
  const { data: taxData, error, isError, isFetching } = useTaxRates();
  const rates = taxData?.items ?? [];
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const createMut = useCreateTaxRate();
  const updateMut = useUpdateTaxRate();
  const toggleActive = useSetTaxRateActive();

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', code: '', region: '', rate: '', inclusive: false, active: true });
    setModalOpen(true);
  };

  const openEdit = (rate: TaxRate) => {
    setEditing(rate);
    setForm({ name: rate.name, code: rate.code ?? '', region: rate.region ?? '',
      rate: rate.rate, inclusive: rate.inclusive, active: rate.active });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.taxRateId, input: form });
      } else {
        await createMut.mutateAsync(form);
      }
      setModalOpen(false);
    } catch {}
  };

  const handleToggle = async (rate: TaxRate) => {
    try { await toggleActive.mutateAsync({ id: rate.taxRateId, active: !rate.active }); } catch {}
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Tax Rates</h1>
        <button onClick={openCreate}
          className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> New Tax Rate
        </button>
      </div>

      <DataState isLoading={isFetching} isError={isError} error={error} empty={rates.length === 0} emptyMessage="No tax rates configured.">
        <div className="overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-900">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Region</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-ink-600 dark:text-ink-300">Rate</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Inclusive</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Status</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-600 dark:text-ink-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) => (
                <tr key={rate.taxRateId} className="border-t border-ink-200 dark:border-ink-800 last:border-0">
                  <td className="px-4 py-2.5">{rate.name}</td>
                  <td className="px-4 py-2.5 align-top">{rate.code ?? '—'}</td>
                  <td className="px-4 py-2.5 align-top">{rate.region ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right align-top">{rate.rate}%</td>
                  <td className="px-4 py-2.5 align-top">{rate.inclusive ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2.5 align-top">
                    <button onClick={() => handleToggle(rate)} className="inline-block">
                      <StatusBadge status={rate.active ? 'active' : 'archived'} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 align-top text-center">
                    <button onClick={() => openEdit(rate)} className="inline-block rounded p-1 text-ink-500 hover:bg-ink-100" title="Edit">
                      <Edit size={14} />
                    </button>
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
          title={editing ? 'Edit Tax Rate' : 'New Tax Rate'}
          onClose={() => setModalOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleSubmit} className="btn btn-primary">{editing ? 'Save' : 'Create'}</button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Name</label>
              <input type="text" value={String(form.name ?? '')} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100" />
            </div>
            <div><label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Code</label>
              <input type="text" value={String(form.code ?? '')} onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100" />
            </div>
            <div><label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Region</label>
              <input type="text" value={String(form.region ?? '')} onChange={(e) => setForm({ ...form, region: e.target.value })}
                className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100" />
            </div>
            <div><label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Rate (%)</label>
              <input type="number" min="0" step="0.01" value={String(form.rate ?? '')} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })}
                className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(form.inclusive)} onChange={(e) => setForm({ ...form, inclusive: e.target.checked })}
                  className="h-4 w-4 rounded border-ink-400 text-brand-600 focus:ring-brand-500" />
                Tax-inclusive
              </label>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(form.active)} onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 rounded border-ink-400 text-brand-600 focus:ring-brand-500" />
                Active
              </label>
            </div>
          </div>
        </Modal>
      )}
    </motion.div>
  );
};

export default TaxSettingsPage;
