import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useInvoices, useCreateInvoice, useCustomers } from '../../hooks/useBilling';
import { DataState } from '../../components/DataState';
import { StatusBadge, CurrencyAmount } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { apiErrorMessage } from '../../lib/api';
import { INVOICE_STATUSES } from '../../types/billing';
import type { CreateInvoiceInput } from '../../services/billing.service';

export const InvoicesPage = () => {
  useDocumentTitle('Invoices');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const { data, error, isError, isFetching, refetch } = useInvoices({ search, status });
  const items = data?.items ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Invoices</h1>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus size={16} className="mr-1" /> New invoice
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-ink-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoices…" className="input pl-10" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary">
          {isFetching ? <Spinner className="h-4 w-4" /> : 'Refresh'}
        </button>
      </div>

      <div className="card p-4">
        <DataState isLoading={isFetching} isError={isError} error={error} empty={items.length === 0} emptyMessage="No invoices found.">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-ink-500">
                <th className="pb-2">Number</th>
                <th className="pb-2">Customer</th>
                <th className="pb-2">Issued</th>
                <th className="pb-2">Due</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Total</th>
                <th className="pb-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => (
                <tr key={inv.invoiceId} className="border-t border-ink-200 dark:border-ink-800">
                  <td className="py-2 font-medium">{inv.invoiceNumber}</td>
                  <td className="py-2">{inv.customerName ?? '—'}</td>
                  <td className="py-2">{new Date(inv.issueDate).toLocaleDateString()}</td>
                  <td className="py-2">{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td className="py-2"><StatusBadge status={inv.status} /></td>
                  <td className="py-2 text-right">
                    <CurrencyAmount minor={inv.totalMinor} currency={inv.currency} />
                  </td>
                  <td className="py-2 text-center">
                    <Link to={`/billing/invoices/${inv.id}`} className="rounded p-1 text-ink-400 hover:bg-ink-100">
                      <ExternalLink size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataState>
      </div>

      <Modal open={modalOpen} title="New invoice" onClose={() => setModalOpen(false)} size="lg">
        <NewInvoiceForm onSuccess={() => { setModalOpen(false); refetch(); }} />
      </Modal>
    </motion.div>
  );
};

function NewInvoiceForm({ onSuccess }: { onSuccess: () => void }) {
  const [customerId, setCustomerId] = useState('');
  const [currency] = useState('USD');
  const [lines, setLines] = useState<Array<{ description: string; quantity: number; unitPrice: number; taxRate?: number }>>([
    { description: '', quantity: 1, unitPrice: 0 },
  ]);
  const [errorMsg, setErrorMsg] = useState('');
  const { data: customers } = useCustomers({});
  const create = useCreateInvoice();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!customerId) {
      setErrorMsg('Select a customer.');
      return;
    }
    const input: CreateInvoiceInput = {
      customerId,
      currency,
      items: lines.filter((l) => l.description.trim()),
      status: 'draft',
    };
    try {
      await create.mutateAsync(input);
      onSuccess();
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, 'Could not create invoice'));
    }
  };

  const updateLine = (idx: number, field: keyof typeof lines[number], value: string | number) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}
      <div>
        <label className="label">Customer</label>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className="input">
          <option value="">Select a customer</option>
          {customers?.items.map((c) => (
            <option key={c.customerId} value={c.customerId}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Lines</label>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input
              className="col-span-5 input"
              placeholder="Description"
              value={l.description}
              onChange={(e) => updateLine(i, 'description', e.target.value)}
              required
            />
            <input type="number" min={1} className="col-span-2 input" placeholder="Qty" value={l.quantity}
              onChange={(e) => updateLine(i, 'quantity', Number(e.target.value))} required />
            <input type="number" min={0} step={0.01} className="col-span-3 input" placeholder="Unit price" value={l.unitPrice}
              onChange={(e) => updateLine(i, 'unitPrice', Number(e.target.value))} required />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onSuccess} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={create.isPending} className="btn-primary">
          {create.isPending ? <Spinner className="h-4 w-4" /> : 'Create'}
        </button>
      </div>
    </form>
  );
}

export default InvoicesPage;