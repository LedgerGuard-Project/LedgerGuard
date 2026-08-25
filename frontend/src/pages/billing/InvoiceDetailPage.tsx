import { useState } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'react-router-dom';
import { Calendar, Plus, Download } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useInvoice, useIssueInvoice, useCancelInvoice, useMarkInvoicePaid } from '../../hooks/useBilling';
import { billingService } from '../../services/billing.service';
import { DataState } from '../../components/DataState';
import { StatusBadge, CurrencyAmount } from '../../components/StatusBadge';
import { InvoicePayments } from '../../components/billing/InvoicePayments';
import { RecordPaymentForm } from '../../components/billing/RecordPaymentForm';
import { apiErrorMessage } from '../../lib/api';
import { formatDate } from '../../utils/format';

export const InvoiceDetailPage = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  useDocumentTitle(invoiceId ? `Invoice #${invoiceId}` : 'Invoice');
  const { data, error, isError, isFetching, refetch } = useInvoice(invoiceId);
  const issue = useIssueInvoice();
  const cancel = useCancelInvoice();
  const markPaid = useMarkInvoicePaid();
  const [payModalOpen, setPayModalOpen] = useState(false);

  const invoice = data?.invoice;
  const payments = data?.payments ?? [];

  if (isFetching) {
    return <DataState isLoading>{null}</DataState>;
  }
  if (isError) return <DataState isError error={error}>{null}</DataState>;
  if (!invoice) return <DataState empty emptyMessage="Invoice not found.">{null}</DataState>;

  const isDraft = invoice.status === 'draft';
  const canPay = invoice.status === 'issued' || invoice.status === 'partially_paid';
  const canCancel = !['paid', 'cancelled'].includes(invoice.status);

  const handleIssue = async () => {
    const due = window.prompt('Due date (YYYY-MM-DD) — leave blank for +30 days');
    try { await issue.mutateAsync({ id: invoice.id, dueDate: due || undefined }); await refetch(); }
    catch (err) { alert(apiErrorMessage(err, 'Could not issue invoice')); }
  };
    const handleMarkPaid = async () => {
    if (!window.confirm('Mark this invoice as paid?')) return;
    try { await markPaid.mutateAsync(invoice.id); await refetch(); }
    catch (err) { alert(apiErrorMessage(err, 'Could not update invoice')); }
  };
  const handleCancel = async () => {
    if (!window.confirm('Cancel this invoice?')) return;
    try { await cancel.mutateAsync(invoice.id); await refetch(); }
    catch (err) { alert(apiErrorMessage(err, 'Could not cancel invoice')); }
  };
  const handleDownloadPdf = async () => {
    try {
      const blob = await billingService.downloadInvoicePdf(invoice.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(apiErrorMessage(err, 'Could not download PDF'));
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-ink-500">{invoice.customerName ?? '—'}</p>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase text-ink-500">Total</p>
          <CurrencyAmount minor={invoice.totalMinor} currency={invoice.currency} className="text-2xl font-bold" />
          <p className="text-xs text-ink-500">
            Subtotal: <CurrencyAmount minor={invoice.subtotalMinor} currency={invoice.currency} />
          </p>
        </div>
        <div className="card p-4 space-y-1">
          <p className="text-xs font-medium uppercase text-ink-500">Dates</p>
          <p className="flex items-center gap-1 text-sm"><Calendar size={14} /> Issued {formatDate(invoice.issueDate)}</p>
          <p className="flex items-center gap-1 text-sm"><Calendar size={14} /> Due {formatDate(invoice.dueDate)}</p>
        </div>
        <div className="card p-4 flex flex-col gap-2">
          <button onClick={handleIssue} disabled={!isDraft || issue.isPending} className="btn-secondary">Issue invoice</button>
          <button onClick={handleMarkPaid} disabled={!canPay || markPaid.isPending} className="btn-secondary">Mark paid</button>
          <button onClick={handleCancel} disabled={!canCancel || cancel.isPending} className="btn-secondary">Cancel</button>
                    <button onClick={handleDownloadPdf} className="btn-secondary">
            <Download size={14} className="mr-1" /> Download PDF
          </button>
          <button onClick={() => setPayModalOpen(true)} className="btn-primary">
            <Plus size={14} className="mr-1" /> Record payment
          </button>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink-600 dark:text-ink-300">Line items</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-ink-500">
              <th className="pb-1">Description</th><th className="pb-1 text-right">Qty</th>
              <th className="pb-1 text-right">Unit</th><th className="pb-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => (
              <tr key={i} className="border-t border-ink-200 dark:border-ink-800">
                <td className="py-1">{it.description}</td>
                <td className="py-1 text-right">{it.quantity}</td>
                <td className="py-1 text-right"><CurrencyAmount minor={it.unitPriceMinor} currency={invoice.currency} /></td>
                <td className="py-1 text-right"><CurrencyAmount minor={it.amountMinor} currency={invoice.currency} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink-600 dark:text-ink-300">Payments on this invoice</h3>
        <InvoicePayments payments={payments} />
      </div>

      <RecordPaymentForm
        invoiceId={invoice.id}
        customerId={invoice.customerId}
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        onSuccess={() => { setPayModalOpen(false); refetch(); }}
      />
    </motion.div>
  );
};

export default InvoiceDetailPage;
