import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Receipt, Users, Wallet, FileText, Clock, ExternalLink, RefreshCw, Percent, FilePlus2, FileMinus2, ClipboardCheck, CalendarDays, BarChart3 } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { StatCard } from '../../components/StatCard';
import { DataState } from '../../components/DataState';
import { StatusBadge, CurrencyAmount } from '../../components/StatusBadge';
import { useBillingSummary } from '../../hooks/useBilling';
import { formatMinor } from '../../utils/format';

export const BillingPage = () => {
    useDocumentTitle('Billing');
  const { data: summary, error, isError, isFetching, refetch } = useBillingSummary();

    const currency = summary?.currency ?? 'USD';
  // `summary` is undefined while the billing-summary query is in flight.
  // DataState renders its children as eagerly-built JSX (NOT a render-prop),
  // so the recent-activity table below is constructed during this render even
  // while DataState is showing its loading spinner. Default `recent` to an empty
  // array so we never dereference an undefined `summary` there (the non-null
  // assertion `summary!.recentTransactions.map(...)` used to throw here).
  const recent = summary?.recentTransactions ?? [];

  const cards = [
    {
      title: 'Total Revenue',
      value: summary ? formatMinor(summary.totalRevenueMinor, currency) : '—',
      icon: <Receipt size={20} />,
    },
    {
      title: "Today's Revenue",
      value: summary ? formatMinor(summary.todayRevenueMinor, currency) : '—',
      icon: <Wallet size={20} />,
    },
    {
      title: 'Current Balance',
      value: summary ? formatMinor(summary.currentBalanceMinor, currency) : '—',
      icon: <Receipt size={20} />,
    },
    {
      title: 'Outstanding Invoices',
      value: summary ? `${summary.outstandingInvoicesCount} ($${formatMinor(summary.outstandingInvoicesMinor, currency)})` : '—',
      icon: <FileText size={20} />,
    },
    {
      title: 'Pending Payments',
      value: summary ? `${summary.pendingCount} ($${formatMinor(summary.pendingAmountMinor, currency)})` : '—',
      icon: <Clock size={20} />,
    },
    {
      title: 'Failed Payments',
      value: summary ? `${summary.failedCount} ($${formatMinor(summary.failedAmountMinor, currency)})` : '—',
      icon: <Wallet size={20} />,
    },
  ];

    const shortcuts: Array<{ name: string; to: string; icon: ReactNode }> = [
    { name: 'Customers', to: '/billing/customers', icon: <Users size={18} className="text-brand-600" /> },
    { name: 'Invoices', to: '/billing/invoices', icon: <FileText size={18} className="text-brand-600" /> },
    { name: 'Payments', to: '/billing/payments', icon: <Wallet size={18} className="text-brand-600" /> },
    { name: 'Ledger', to: '/billing/ledger', icon: <Clock size={18} className="text-brand-600" /> },
    { name: 'Recurring', to: '/billing/recurring', icon: <RefreshCw size={18} className="text-brand-600" /> },
    { name: 'Tax Rates', to: '/billing/tax-rates', icon: <Percent size={18} className="text-brand-600" /> },
    { name: 'Credit Notes', to: '/billing/credit-notes', icon: <FilePlus2 size={18} className="text-brand-600" /> },
    { name: 'Debit Notes', to: '/billing/debit-notes', icon: <FileMinus2 size={18} className="text-brand-600" /> },
    { name: 'Approvals', to: '/billing/approvals', icon: <ClipboardCheck size={18} className="text-brand-600" /> },
    { name: 'Financial Periods', to: '/billing/financial-periods', icon: <CalendarDays size={18} className="text-brand-600" /> },
    { name: 'Reports', to: '/billing/reports', icon: <BarChart3 size={18} className="text-brand-600" /> },
    ];


  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Billing</h1>
        <button onClick={() => refetch()} className="text-sm text-brand-700 hover:underline">
          Refresh
        </button>
      </div>

            <DataState isLoading={isFetching} isError={isError} error={error}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {cards.map((c) => (
            <StatCard key={c.title} title={c.title} value={c.value} icon={c.icon} />
          ))}
        </div>
      </DataState>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shortcuts.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="card p-4 transition-shadow hover:shadow-card-lg flex items-center justify-between"
          >
                        <div className="flex items-center gap-3">
              {a.icon}
              <span className="font-medium text-ink-900 dark:text-white">{a.name}</span>
            </div>
            <ExternalLink size={16} className="text-ink-400" />
          </Link>
        ))}
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-600 dark:text-ink-300">Recent activity</h2>
                <DataState
          isLoading={isFetching}
          isError={isError}
          error={error}
                    empty={recent.length === 0}
          emptyMessage="No recent activity."
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-ink-500">
                <th className="pb-2">Time</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
                            {recent.map((t) => (
                <tr key={t.transactionId} className="border-t border-ink-200 dark:border-ink-800">
                  <td className="py-2">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="py-2 capitalize">{t.type}</td>
                  <td className="py-2">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="py-2 text-right">
                    <CurrencyAmount minor={t.amountMinor} currency={t.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataState>
      </div>
    </motion.div>
  );
};

export default BillingPage;
