import { useState } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useAnomalies, useDetectAnomalies, useReviewAnomaly } from '../../hooks/useAnalytics';
import { PageScaffold } from '../../components/charts';
import { formatDate, formatNumber } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import { canAct } from '../../lib/roles';
import { UserRole } from '@ledgerguard/shared';

const SEVERITY: Record<string, string> = {
  LOW: 'bg-sky-100 text-sky-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  HIGH: 'bg-red-100 text-red-800',
  CRITICAL: 'bg-red-200 text-red-900',
};

const STATUS_OPTIONS = ['', 'open', 'acknowledged', 'dismissed'];

export const AnomaliesPage = () => {
  const [severity, setSeverity] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  useDocumentTitle('Anomaly Detection');
  const role = useAuthStore((s) => s.user?.role);
  // Read is open to all roles; mutations are Finance Manager+. Server enforces
  // requireRole(FinanceManager) on POST /anomalies/detect and PATCH /anomalies/:id.
  const canManage = canAct(role ?? '', UserRole.FinanceManager);
  const { data = [], isLoading } = useAnomalies({ severity: severity || undefined, status: status || undefined });
  const detect = useDetectAnomalies();
  const review = useReviewAnomaly();

  return (
    <PageScaffold
      title="Anomaly Detection"
      subtitle="Outliers detected by deterministic statistics on your ledger"
      actions={
        canManage ? (
          <button
            onClick={() => detect.mutate()}
            disabled={detect.isPending}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {detect.isPending ? 'Running…' : 'Run Detection'}
          </button>
        ) : (
          <span className="text-xs text-ink-400">Viewer access — review actions require Finance Manager</span>
        )
      }
    >
      {detect.data && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">
          Detection complete: {detect.data.detected} candidate(s), {detect.data.persisted} new persisted.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => (
          <button key={s} onClick={() => setSeverity(s)} className={severity === s ? 'rounded-md bg-brand-600 px-2.5 py-1 text-xs text-white' : 'rounded-md border border-ink-200 px-2.5 py-1 text-xs text-ink-600 dark:border-ink-800 dark:text-ink-300'}>
            {s || 'All severities'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Filter by review status">
        {STATUS_OPTIONS.map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)} aria-pressed={status === s} className={status === s ? 'rounded-md bg-brand-600 px-2.5 py-1 text-xs text-white' : 'rounded-md border border-ink-200 px-2.5 py-1 text-xs text-ink-600 dark:border-ink-800 dark:text-ink-300'}>
            {s || 'All statuses'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 pt-2">
        {isLoading ? (
          <div className="h-40 animate-pulse rounded bg-ink-100 dark:bg-ink-800" />
        ) : data.length === 0 ? (
          <p className="text-sm text-ink-400">No anomalies detected for this filter.</p>
        ) : (
          data.map((a) => (
            <div key={a.anomalyId} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${SEVERITY[a.severity] ?? 'bg-ink-100 text-ink-700'}`}>{a.severity}</span>
                    <span className="font-medium text-ink-900 dark:text-white">{a.kind.replace(/_/g, ' ')}</span>
                    {a.amountMinor != null && a.amountMinor > 0 && <span className="text-sm text-ink-500">{formatNumber(Math.round(a.amountMinor / 100))}</span>}
                  </div>
                  <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{a.reason}</p>
                  <p className="mt-1 text-xs text-ink-400">{formatDate(a.detectedAt)}</p>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <button onClick={() => review.mutate({ anomalyId: a.anomalyId, action: 'acknowledged' })} className="rounded-md border border-ink-200 px-2 py-1 text-xs dark:border-ink-800">Acknowledge</button>
                    <button onClick={() => review.mutate({ anomalyId: a.anomalyId, action: 'dismissed' })} className="rounded-md border border-ink-200 px-2 py-1 text-xs dark:border-ink-800">Dismiss</button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </PageScaffold>
  );
};

export default AnomaliesPage;