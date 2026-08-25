import { motion } from 'framer-motion';
import { useParams } from 'react-router-dom';
import { Calendar, Hash, Tag } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useTransaction } from '../../hooks/useBilling';
import { DataState } from '../../components/DataState';
import { StatusBadge, CurrencyAmount } from '../../components/StatusBadge';
import { formatDate } from '../../utils/format';

export const TransactionDetailPage = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  useDocumentTitle(transactionId ? `Transaction ${transactionId}` : 'Transaction');
  const { data, error, isError, isFetching } = useTransaction(transactionId);
  const tx = data?.transaction;

  if (isFetching) return <DataState isLoading>{null}</DataState>;
  if (isError) return <DataState isError error={error}>{null}</DataState>;
  if (!tx) return <DataState empty emptyMessage="Transaction not found.">{null}</DataState>;

  const entries = data.entries;
  const auditEvents = data.auditEvents;
  const idempotency = data.idempotency;
  const customer = data.customer;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">{tx.transactionId}</h1>
          <p className="text-sm text-ink-500">{customer?.name ?? '—'}</p>
        </div>
        <StatusBadge status={tx.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase text-ink-500">Amount</p>
          <CurrencyAmount minor={tx.amountMinor} currency={tx.currency} className="text-2xl font-bold" />
          <p className="text-xs text-ink-500 capitalize">{tx.type}</p>
        </div>
        <div className="card p-4 space-y-1">
          <p className="text-xs font-medium uppercase text-ink-500">Reference</p>
          <p className="flex items-center gap-1 text-sm"><Hash size={14} /> {tx.reference ?? '—'}</p>
          <p className="flex items-center gap-1 text-sm"><Calendar size={14} /> {formatDate(tx.createdAt)}</p>
        </div>
        <div className="card p-4 space-y-1">
          <p className="text-xs font-medium uppercase text-ink-500">Idempotency</p>
          <p className="flex items-center gap-1 text-sm">
            <Tag size={14} /> {tx.idempotencyKey ?? '—'}
          </p>
          {idempotency && <p className="text-xs text-ink-500">status: {idempotency.status}</p>}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink-600 dark:text-ink-300">Ledger entries</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-ink-500">
              <th className="pb-1">Entry</th>
              <th className="pb-1">Account</th>
              <th className="pb-1">Direction</th>
              <th className="pb-1 text-right">Debit</th>
              <th className="pb-1 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.entryId} className="border-t border-ink-200 dark:border-ink-800">
                <td className="py-1 text-xs text-ink-500">{e.description}</td>
                <td className="py-1">{e.accountId}</td>
                <td className="py-1 capitalize">{e.direction}</td>
                <td className="py-1 text-right">
                  {e.direction === 'debit' ? <CurrencyAmount minor={e.amountMinor} currency={tx.currency} /> : '—'}
                </td>
                <td className="py-1 text-right">
                  {e.direction === 'credit' ? <CurrencyAmount minor={e.amountMinor} currency={tx.currency} /> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink-600 dark:text-ink-300">Audit log</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-ink-500">
              <th className="pb-1">Action</th>
              <th className="pb-1">At</th>
              <th className="pb-1">Details</th>
            </tr>
          </thead>
          <tbody>
            {auditEvents.map((a) => (
              <tr key={`${a.action}-${a.createdAt}`} className="border-t border-ink-200 dark:border-ink-800">
                <td className="py-1 capitalize">{a.action}</td>
                <td className="py-1">{formatDate(a.createdAt)}</td>
                <td className="py-1 text-xs text-ink-500">{JSON.stringify(a.details ?? {})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

export default TransactionDetailPage;

