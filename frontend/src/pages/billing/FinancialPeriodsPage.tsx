import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pause, Play } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { DataState } from '../../components/DataState';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { useFinancialPeriods, useCreateFinancialPeriod, useCloseFinancialPeriod, useReopenFinancialPeriod } from '../../hooks/useBilling';
import { formatDate } from '../../utils/format';
import type { FinancialPeriod } from '../../types/billing';

export const FinancialPeriodsPage = () => {
  useDocumentTitle('Financial Periods');
  const { periods, error, isError, isFetching } = useFinancialPeriods();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const createMut = useCreateFinancialPeriod();
  const closeMut = useCloseFinancialPeriod();
  const reopenMut = useReopenFinancialPeriod();

  const handleCreate = async () => {
    try { await createMut.mutateAsync(form); setModalOpen(false); } catch {}
  };
  const handleClose = async (p: FinancialPeriod) => { try { await closeMut.mutateAsync(p.periodId); } catch {} };
  const handleReopen = async (p: FinancialPeriod) => { try { await reopenMut.mutateAsync(p.periodId); } catch {} };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Financial Periods</h1>
        <button onClick={() => { setModalOpen(true); setForm({ name: '', startDate: '', endDate: '' }); }}
          className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> New Period
        </button>
      </div>

      <DataState isLoading={isFetching} isError={isError} error={error} empty={periods.length === 0} emptyMessage="No financial periods configured.">
        <div className="overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-800">
          <table className="w-full text-sm">
            <thead><tr className="bg-ink-50 dark:bg-ink-900">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Start</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">End</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Status</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-600 dark:text-ink-300">Actions</th>
            </tr></thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.periodId} className="border-t border-ink-200 dark:border-ink-800 last:border-0">
                  <td className="px-4 py-2.5">{p.name}</td>
                  <td className="px-4 py-2.5 align-top">{formatDate(p.startDate)}</td>
                  <td className="px-4 py-2.5 align-top">{formatDate(p.endDate)}</td>
                  <td className="px-4 py-2.5 align-top"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-2.5 text-center align-top space-x-1">
                    {p.status === 'open' && (
                      <button onClick={() => handleClose(p)} className="inline-block rounded p-1 text-red-600 hover:bg-red-50" title="Close"><Pause size={14} /></button>
                    )}
                    {p.status === 'closed' && (
                      <button onClick={() => handleReopen(p)} className="inline-block rounded p-1 text-blue-600 hover:bg-blue-50" title="Reopen"><Play size={14} /></button>
                    )}
                    {p.status === 'reopened' && (
                      <button onClick={() => handleClose(p)} className="inline-block rounded p-1 text-red-600 hover:bg-red-50" title="Close"><Pause size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
      <Modal
        open={modalOpen}
        title="New Financial Period"
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setModalOpen(false)} className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium hover:bg-ink-50">Cancel</button>
            <button onClick={handleCreate} disabled={createMut.isPending}
              className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {createMut.isPending ? 'Creating…' : 'Create Period'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Name</span>
            <input
              value={String(form.name ?? '')}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. FY 2027 – August"
              className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Start Date</span>
              <input
                type="date"
                value={String(form.startDate ?? '')}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">End Date</span>
              <input
                type="date"
                value={String(form.endDate ?? '')}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </label>
          </div>
          {createMut.isError && (
            <p className="text-sm text-red-600">{createMut.error?.message ?? 'Failed to create period.'}</p>
          )}
        </div>
      </Modal>
    </motion.div>
  );
};

export default FinancialPeriodsPage;

