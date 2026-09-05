import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Gauge } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { DataState } from '../components/DataState';
import { useCloseDashboard } from '../hooks/useEnterprise';
import { formatMinor } from '../utils/format';

export const CloseDashboardPage = () => {
  useDocumentTitle('Month-End Close');
  const { data, isError, error, isFetching } = useCloseDashboard();

  const stats = data
    ? [
        { label: 'Invoices Issued', value: String(data.invoicesIssued.count), sub: formatMinor(data.invoicesIssued.totalMinor, data.currency ?? 'USD') },
        { label: 'Payments Collected', value: String(data.paymentsCollected.count), sub: formatMinor(data.paymentsCollected.totalMinor, data.currency ?? 'USD') },
        { label: 'Outstanding AR', value: String(data.outstandingAR.count), sub: formatMinor(data.outstandingAR.totalMinor, data.currency ?? 'USD') },
        { label: 'Net Cash Flow', value: '', sub: formatMinor(data.netCashFlowMinor, data.currency ?? 'USD') },
        { label: 'Unreconciled Payments', value: String(data.unreconciledPayments), sub: 'bank rows unmatched/mismatched' },
        { label: 'Ledger Adjustments', value: String(data.ledgerAdjustments), sub: 'adjustment transactions' },
        { label: 'Pending Approvals', value: String(data.pendingApprovals), sub: 'awaiting decision' },
        { label: 'Anomalies (critical)', value: String(data.anomalies), sub: 'open critical exceptions' },
      ]
    : [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Month-End Close Dashboard</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Live close readiness computed from real financial data. Critical blockers prevent a ready verdict.</p>
      </div>

      <DataState isLoading={isFetching && !data} isError={isError} error={error} empty={false} emptyMessage="">
        {data && (
          <>
            {/* Readiness */}
            <div className={`rounded-xl border p-5 ${data.readyToClose ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'}`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Gauge size={28} className={data.readyToClose ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'} />
                  <div>
                    <p className="text-sm font-medium text-ink-700 dark:text-ink-200">Close readiness</p>
                    <p className="text-lg font-bold text-ink-900 dark:text-white">
                      {data.readinessScore === null ? 'No financial data yet' : `${data.readinessScore}% — ${data.readyToClose ? 'READY TO CLOSE' : 'BLOCKED'}`}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  Score = passed checks / total. Critical checks (exceptions, approval SLA) must all pass.
                </p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                  <p className="text-xs text-ink-500 dark:text-ink-400">{s.label}</p>
                  <p className="mt-1 text-xl font-bold text-ink-900 dark:text-white">{s.value || s.sub}</p>
                  {s.value && <p className="text-xs text-ink-500 dark:text-ink-400">{s.sub}</p>}
                </div>
              ))}
            </div>

            {/* Checks */}
            <div className="rounded-lg border border-ink-200 dark:border-ink-800">
              <p className="border-b border-ink-200 px-4 py-3 text-sm font-semibold text-ink-900 dark:border-ink-800 dark:text-white">Close Checks</p>
              <ul>
                {data.checks.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 last:border-0 dark:border-ink-800">
                    <div className="flex items-center gap-3">
                      {c.passed ? (
                        <CheckCircle2 size={18} className="text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle size={18} className={c.critical ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'} />
                      )}
                      <div>
                        <p className="text-sm font-medium text-ink-900 dark:text-white">
                          {c.label}
                          {c.critical && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">critical</span>}
                        </p>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{c.detail}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </DataState>
    </motion.div>
  );
};

export default CloseDashboardPage;