import { DataState } from '../DataState';
import { StatusBadge, CurrencyAmount } from '../StatusBadge';
import { formatDate } from '../../utils/format';
import type { LedgerTransaction } from '../../types/billing';

export function InvoicePayments({ payments }: { payments: LedgerTransaction[] }) {
  return (
    <DataState isLoading={false} empty={payments.length === 0} emptyMessage="No payments recorded.">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-ink-500">
            <th className="pb-1">Date</th>
            <th className="pb-1">Method</th>
            <th className="pb-1">Status</th>
            <th className="pb-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.transactionId} className="border-t border-ink-200 dark:border-ink-800">
              <td className="py-1">{formatDate(p.createdAt)}</td>
              <td className="py-1">{p.paymentMethod ?? '—'}</td>
              <td className="py-1">
                <StatusBadge status={p.status} />
              </td>
              <td className="py-1 text-right">
                <CurrencyAmount minor={p.amountMinor} currency={p.currency} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataState>
  );
}
