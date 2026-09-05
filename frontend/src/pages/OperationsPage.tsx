import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { DataState } from '../components/DataState';
import { useOperationsQueue } from '../hooks/useEnterprise';
import { formatMinor } from '../utils/format';
import type { OperationsItem } from '../services/enterprise.service';

const TYPE_LABELS: Record<OperationsItem['type'], string> = {
  pending_approval: 'Pending Approvals',
  failed_payment: 'Failed Payments',
  overdue_invoice: 'Overdue Invoices',
  exception: 'Reconciliation Exceptions',
  failed_webhook: 'Failed Webhooks',
};

const FILTERS = ['all', 'pending_approval', 'failed_payment', 'overdue_invoice', 'exception', 'failed_webhook'] as const;

const SLA_STYLES: Record<string, string> = {
  on_track: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  at_risk: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  breached: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  resolved: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
};

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  low: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
};

function ageLabel(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export const OperationsPage = () => {
  useDocumentTitle('Operations Queue');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const { data, isError, error, isFetching } = useOperationsQueue();
  const items = (data?.items ?? []).filter((i) => filter === 'all' || i.type === filter);
  const summary = data?.summary ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Finance Operations Work Queue</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Unified queue of work items across approvals, payments, reconciliation and webhooks — with live SLA tracking.</p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {summary.map((s) => (
          <button
            key={s.type}
            onClick={() => setFilter(s.type)}
            className={`rounded-lg border p-3 text-left transition ${filter === s.type ? 'border-brand-500 ring-1 ring-brand-500' : 'border-ink-200 dark:border-ink-800'} bg-white dark:bg-ink-900`}
          >
            <p className="text-xs text-ink-500 dark:text-ink-400">{TYPE_LABELS[s.type]}</p>
            <p className="mt-1 text-xl font-bold text-ink-900 dark:text-white">{s.count}</p>
            {s.breached > 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertTriangle size={12} /> {s.breached} SLA breached
              </p>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700'}`}
          >
            {f === 'all' ? 'All' : TYPE_LABELS[f]}
          </button>
        ))}
      </div>

      <DataState isLoading={isFetching && !data} isError={isError} error={error} empty={items.length === 0} emptyMessage="Queue is clear. Nothing needs attention.">
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={`${item.type}-${item.id}`}
              to={item.link}
              className="block rounded-lg border border-ink-200 bg-white p-4 transition hover:border-brand-400 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-brand-600"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[item.priority]}`}>{item.priority}</span>
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600 dark:bg-ink-800 dark:text-ink-300">{TYPE_LABELS[item.type]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SLA_STYLES[item.sla.status]}`}>SLA: {item.sla.status.replace('_', ' ')}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-ink-900 dark:text-white">{item.title}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {item.owner ? `Owner: ${item.owner} · ` : ''}Age: {ageLabel(item.createdAt)}
                    {item.amountMinor !== null && item.currency ? ` · ${formatMinor(item.amountMinor, item.currency)}` : ''}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </DataState>
    </motion.div>
  );
};

export default OperationsPage;