import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, FileText, XCircle } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { DataState } from '../../components/DataState';
import { Modal } from '../../components/Modal';
import { StatusBadge, CurrencyAmount } from '../../components/StatusBadge';
import { useCreditNotes, useCreateCreditNote, useIssueCreditNote, useCancelCreditNote } from '../../hooks/useBilling';



export const CreditNotesPage = () => {
  useDocumentTitle('Credit Notes');
  const { data: cnData, error, isError, isFetching } = useCreditNotes();
  const notes = cnData?.items ?? [];
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const createMut = useCreateCreditNote();
  const issueMut = useIssueCreditNote();
  const cancelMut = useCancelCreditNote();

  const handleCreate = async () => {
    try { await createMut.mutateAsync(form); setModalOpen(false); } catch {}
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Credit Notes</h1>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> New Credit Note
        </button>
      </div>
      <DataState isLoading={isFetching} isError={isError} error={error} empty={notes.length === 0} emptyMessage="No credit notes found.">
        <div className="overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-800">
          <table className="w-full text-sm">
            <thead><tr className="bg-ink-50 dark:bg-ink-900">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Number</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Customer</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-ink-600 dark:text-ink-300">Amount</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Status</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-600 dark:text-ink-300">Actions</th>
            </tr></thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.creditNoteId} className="border-t border-ink-200 dark:border-ink-800 last:border-0">
                  <td className="px-4 py-2.5">{n.creditNoteNumber}</td>
                  <td className="px-4 py-2.5">{n.customerName ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right"><CurrencyAmount minor={n.totalMinor} currency={n.currency} /></td>
                  <td className="px-4 py-2.5"><StatusBadge status={n.status} /></td>
                  <td className="px-4 py-2.5 text-center space-x-1">
                    {n.status === 'draft' && (
                      <button onClick={() => issueMut.mutate(n.creditNoteId)} className="inline-block rounded p-1 text-green-600 hover:bg-green-50" title="Issue"><FileText size={14} /></button>
                    )}
                    {n.status === 'issued' && (
                      <button onClick={() => cancelMut.mutate(n.creditNoteId)} className="inline-block rounded p-1 text-red-600 hover:bg-red-50" title="Cancel"><XCircle size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
      {modalOpen && (
        <Modal open={modalOpen} title="New Credit Note" onClose={() => setModalOpen(false)}
          footer={<div className="flex justify-end gap-2"><button onClick={() => setModalOpen(false)} className="btn btn-ghost">Cancel</button><button onClick={handleCreate} className="btn btn-primary">Create</button></div>}>
          <CNForm form={form} setForm={setForm} />
        </Modal>
      )}
    </motion.div>
  );
};

export default CreditNotesPage;

const CNForm = ({ form, setForm }: { form: Record<string, unknown>; setForm: (f: Record<string, unknown>) => void }) => (
  <div className="grid gap-4">
    <div><label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Invoice ID</label>
      <input type="text" placeholder="INV-2026-0007" value={String(form.invoiceId ?? '')}
        onChange={(e) => setForm({ ...form, invoiceId: e.target.value })}
        className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100" />
    </div>
    <div><label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Amount</label>
      <input type="number" min="0" step="0.01" value={String(form.amount ?? '')}
        onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
        className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100" />
    </div>
    <div><label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Reason</label>
      <input type="text" placeholder="Returned goods, overcharge" value={String(form.reason ?? '')}
        onChange={(e) => setForm({ ...form, reason: e.target.value })}
        className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100" />
    </div>
  </div>
);
