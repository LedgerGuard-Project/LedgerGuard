import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useCustomers, useCreateCustomer } from '../../hooks/useBilling';
import { DataState } from '../../components/DataState';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { apiErrorMessage } from '../../lib/api';

export const CustomersPage = () => {
  useDocumentTitle('Customers');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
    const { data, error, isError, isFetching, refetch } = useCustomers({ search, status });

  const items = data?.items ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Customers</h1>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus size={16} className="mr-1" /> New customer
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers…"
            className="input pl-10"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
                <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary">
          {isFetching ? <Spinner className="h-4 w-4" /> : 'Refresh'}
        </button>
      </div>

      <div className="card p-4">
        <DataState isLoading={isFetching} isError={isError} error={error} empty={items.length === 0} emptyMessage="No customers match your search.">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-ink-500">
                <th className="pb-2">Name</th><th className="pb-2">Email</th><th className="pb-2">Company</th><th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.customerId} className="border-t border-ink-200 dark:border-ink-800">
                  <td className="py-2 font-medium">{c.name}</td>
                  <td className="py-2">{c.email ?? '—'}</td>
                  <td className="py-2">{c.companyName ?? '—'}</td>
                  <td className="py-2"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataState>
      </div>

      <Modal open={modalOpen} title="New customer" onClose={() => setModalOpen(false)}>
        <NewCustomerForm onSuccess={() => { setModalOpen(false); refetch(); }} />
      </Modal>
    </motion.div>
  );
};

function NewCustomerForm({ onSuccess }: { onSuccess: () => void }) {
  const create = useCreateCustomer();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

    const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync({ name, email, currency: 'USD' });
      onSuccess();
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, 'Could not create customer'));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}
      <div>
        <label className="label">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
      </div>
      <div>
        <label className="label">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional@example.com" className="input" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onSuccess} className="btn-outline">Cancel</button>
                <button type="submit" disabled={create.isPending} className="btn-primary">
          {create.isPending ? <Spinner className="h-4 w-4" /> : 'Create'}
        </button>
      </div>
    </form>
  );
};

export default CustomersPage;
