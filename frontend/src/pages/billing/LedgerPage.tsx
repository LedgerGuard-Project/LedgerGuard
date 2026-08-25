import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useLedger } from '../../hooks/useBilling';
import { DataState } from '../../components/DataState';
import { StatusBadge, CurrencyAmount } from '../../components/StatusBadge';
import { formatDate } from '../../utils/format';

export const LedgerPage = () => {
  useDocumentTitle('Ledger');
  const [search, setSearch] = useState('');
    const { data, error, isError, isFetching } = useLedger({ search });
  const items = data?.items ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Ledger</h1>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-2.5 text-ink-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ledger…" className="input pl-10" />
      </div>

      <div className="card p-4">
        <DataState isLoading={isFetching} isError={isError} error={error} empty={items.length === 0} emptyMessage="No ledger entries.">
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-ink-500">
                  <th className="pb-1">Date</th><th className="pb-1">Customer</th><th className="pb-1">Type</th>
                  <th className="pb-1">Status</th><th className="pb-1">Reference</th><th className="pb-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.transactionId} className="border-t border-ink-200 dark:border-ink-800">
                    <td className="py-1">{formatDate(t.createdAt)}</td>
                    <td className="py-1">{t.customerId}</td>
                    <td className="py-1 capitalize">{t.type}</td>
                    <td className="py-1"><StatusBadge status={t.status} /></td>
                    <td className="py-1">{t.reference ?? '—'}</td>
                    <td className="py-1 text-right"><CurrencyAmount minor={t.amountMinor} currency={t.currency} /></td>
                  </tr>
                ))}
              </tbody>
                        </table>
          </>
                </DataState>
      </div>
    </motion.div>
  );
};

export default LedgerPage;
