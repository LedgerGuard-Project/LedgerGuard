import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePayments, useRefundPayment } from '../../hooks/useBilling';
import { DataState } from '../../components/DataState';
import { StatusBadge, CurrencyAmount } from '../../components/StatusBadge';
import { CreatePaymentForm } from '../../components/billing/CreatePaymentForm';
import { Spinner } from '../../components/Spinner';
import { apiErrorMessage } from '../../lib/api';
import { formatDate } from '../../utils/format';

export const PaymentsPage = () => {
  useDocumentTitle('Payments');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const { data, error, isError, isFetching, refetch } = usePayments({ search });
  const refund = useRefundPayment();
  const items = data?.items ?? [];

  const handleRefund = async (transactionId: string) => {
    const amt = window.prompt('Refund amount (major units)');
    if (!amt) return;
    try {
      await refund.mutateAsync({ id: transactionId, input: { amount: Number(amt) * 100 } });
      refetch();
    } catch (err) {
      alert(apiErrorMessage(err, 'Could not refund'));
    }
  };

  const isRefundable = (status: string) => status === 'completed' || status === 'processing';

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Payments</h1>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus size={16} className="mr-1" /> Record payment
        </button>
      </div>

      <div className="relative flex-1 max-w-md">
        <Search size={16} className="absolute left-3 top-2.5 text-ink-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search payments…" className="input pl-10" />
      </div>

      <div className="card p-4">
        <DataState isLoading={isFetching} isError={isError} error={error} empty={items.length === 0} emptyMessage="No payments found.">
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-ink-500">
                  <th className="pb-1">Date</th><th className="pb-1">Customer</th><th className="pb-1">Type</th>
                  <th className="pb-1">Method</th><th className="pb-1">Status</th><th className="pb-1 text-right">Amount</th><th className="pb-1 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.transactionId} className="border-t border-ink-200 dark:border-ink-800">
                    <td className="py-1">{formatDate(p.createdAt)}</td>
                    <td className="py-1">{p.customerId}</td>
                    <td className="py-1 capitalize">{p.type}</td>
                    <td className="py-1">{p.paymentMethod ?? '—'}</td>
                    <td className="py-1"><StatusBadge status={p.status} /></td>
                    <td className="py-1 text-right"><CurrencyAmount minor={p.amountMinor} currency={p.currency} /></td>
                    <td className="py-1 text-center">
                      <button
                        onClick={() => handleRefund(p.transactionId)}
                        disabled={!isRefundable(p.status) || refund.isPending}
                        className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="Refund"
                      >
                        {refund.isPending ? <Spinner className="h-3 w-3" /> : 'Refund'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        </DataState>
      </div>

      <CreatePaymentForm open={modalOpen} onClose={() => setModalOpen(false)} onSuccess={() => { setModalOpen(false); refetch(); }} />
    </motion.div>
  );
};

export default PaymentsPage;
