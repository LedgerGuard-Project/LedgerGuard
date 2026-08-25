import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useReconcile, useReconcileResult } from '../../hooks/useBilling';
import { Badge } from '../../components/DataState';
import { apiErrorMessage } from '../../lib/api';
import { formatDate } from '../../utils/format';
import type {
  ReconciliationRun,
  ReconciliationDiscrepancy,
  ReconciliationStatus,
  ReconciliationCheckType,
} from '../../types/billing';

const STATUS_VARIANT: Record<ReconciliationStatus, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  clean: 'success',
  repaired: 'info',
  discrepancies: 'error',
  unclean: 'warning',
  failed: 'error',
};

const CHECK_LABEL: Record<ReconciliationCheckType, string> = {
  unbalanced_entries: 'Unbalanced journal entries',
  orphan_entries: 'Orphaned ledger entries',
  account_balance: 'Account balance drift',
  invoice_settlement: 'Invoice settlement drift',
};

export const ReconcilePage = () => {
  useDocumentTitle('Reconciliation');
  const reconcile = useReconcile();
  const [repair, setRepair] = useState(false);
  const [runId, setRunId] = useState<string | undefined>(undefined);

  const resultQuery = useReconcileResult(runId);
  const run = resultQuery.data?.run ?? reconcile.data?.run ?? null;

  const startReconcile = async () => {
    setRunId(undefined);
    const res = await reconcile.mutateAsync(repair);
    setRunId(res.idempotencyKey);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Reconciliation</h1>
        <ShieldCheck className="text-brand-600" />
      </div>

      <div className="card p-4 space-y-3">
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Re-derive the billing ledger from its source-of-truth aggregates and detect drift
          (unbalanced postings, orphaned entries, account-balance or invoice-settlement mismatches).
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={repair}
            onChange={(e) => setRepair(e.target.checked)}
            className="accent-brand-600"
          />
          Apply best-effort repairs (requires transactional MongoDB)
        </label>
        <button
          onClick={() => void startReconcile()}
          disabled={reconcile.isPending}
          className="btn btn-primary"
        >
          {reconcile.isPending ? 'Reconciling…' : 'Run reconciliation'}
        </button>
        {reconcile.isError && (
          <p className="text-sm text-red-600">{apiErrorMessage(reconcile.error)}</p>
        )}
        {reconcile.data?.replay && (
          <p className="text-sm text-amber-600">Replayed an identical prior reconciliation.</p>
        )}
      </div>

      {run && <RunSummary run={run} />}
    </motion.div>
  );
};

const RunSummary = ({ run }: { run: ReconciliationRun }) => (
  <div className="card p-4 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-sm font-semibold text-ink-600 dark:text-ink-300">Result</h2>
      <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
      <span className="text-xs text-ink-500">
        {run.discrepancyCount} discrepancy{run.discrepancyCount === 1 ? '' : 's'}; {run.repairedCount} repaired
      </span>
      <span className="text-xs text-ink-400">{formatDate(run.checkedAt)}</span>
    </div>

    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-medium text-ink-500">
          <th className="pb-2">Check</th>
          <th className="pb-2">Entity</th>
          <th className="pb-2">Severity</th>
          <th className="pb-2">Expected</th>
          <th className="pb-2">Actual</th>
          <th className="pb-2">Action</th>
        </tr>
      </thead>
      <tbody>
        {run.discrepancies.length === 0 ? (
          <tr><td colSpan={6} className="py-2">All invariants passed — no discrepancies.</td></tr>
        ) : (
          run.discrepancies.map((d) => <DiscrepancyRow key={`${d.check}-${d.entityId}`} d={d} />)
        )}
      </tbody>
    </table>
  </div>
);

const DiscrepancyRow = ({ d }: { d: ReconciliationDiscrepancy }) => (
  <tr className="border-t border-ink-200 dark:border-ink-800">
    <td className="py-2">{CHECK_LABEL[d.check] ?? d.check}</td>
    <td className="py-2">{d.entityId}</td>
    <td className="py-2 capitalize">{d.severity}</td>
    <td className="py-2">{d.expectedMinor ?? '—'}</td>
    <td className="py-2">{d.actualMinor ?? '—'}</td>
    <td className="py-2">{d.repaired ? <Badge variant="success">repaired</Badge> : <span className="text-ink-500">review</span>}</td>
  </tr>
);

export default ReconcilePage;