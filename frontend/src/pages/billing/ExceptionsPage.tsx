import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ShieldCheck, Clock } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { DataState } from '../../components/DataState';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuthStore } from '../../store/authStore';
import { UserRole } from '@ledgerguard/shared';
import {
  useExceptions,
  useCreateException,
  useAssignException,
  useInvestigateException,
  useResolveException,
  useReopenException,
} from '../../hooks/useEnterprise';
import { formatMinor } from '../../utils/format';
import type { ExceptionStatus } from '../../types/billing';
import type { ExceptionWithSla } from '../../services/enterprise.service';

const TABS: Array<{ key: ExceptionStatus | 'all'; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'investigating', label: 'Investigating' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'ignored', label: 'Ignored' },
  { key: 'all', label: 'All' },
];

const SLA_STYLES: Record<string, string> = {
  on_track: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  at_risk: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  breached: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  resolved: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
};

function SlaBadge({ sla }: { sla: ExceptionWithSla['sla'] }) {
  const hours = Math.abs(sla.remainingMs) / 3_600_000;
  const label =
    sla.status === 'resolved'
      ? 'resolved'
      : sla.dueAt === null
        ? 'no SLA'
        : sla.status === 'breached'
          ? `${hours.toFixed(1)}h over`
          : `${hours.toFixed(1)}h left`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${SLA_STYLES[sla.status] ?? SLA_STYLES.resolved}`}>
      <Clock size={12} /> {label}
    </span>
  );
}

export const ExceptionsPage = () => {
  useDocumentTitle('Reconciliation Exceptions');
  const role = useAuthStore((s) => s.user?.role);
  const canMutate = role === UserRole.SuperAdmin || role === UserRole.CompanyAdmin || role === UserRole.FinanceManager;

  const [tab, setTab] = useState<ExceptionStatus | 'all'>('open');
  const params = useMemo(() => (tab === 'all' ? {} : { status: tab }), [tab]);
  const { data, isError, error, isFetching } = useExceptions(params);
  const items = data?.items ?? [];

  const createMut = useCreateException();
  const assignMut = useAssignException();
  const investigateMut = useInvestigateException();
  const resolveMut = useResolveException();
  const reopenMut = useReopenException();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    type: 'unmatched_payment', severity: 'medium', amountMinor: '', currency: 'USD', reason: '', paymentId: '', invoiceId: '',
  });
  const [resolveTarget, setResolveTarget] = useState<ExceptionWithSla | null>(null);
  const [resolution, setResolution] = useState('');
  const [resolveIgnore, setResolveIgnore] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<ExceptionWithSla | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const submitCreate = async () => {
    await run(async () => {
      await createMut.mutateAsync({
        type: form.type,
        severity: form.severity,
        amountMinor: Math.round(Number(form.amountMinor) * 100),
        currency: form.currency,
        reason: form.reason,
        paymentId: form.paymentId || undefined,
        invoiceId: form.invoiceId || undefined,
      });
      setCreateOpen(false);
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Payment & Reconciliation Exceptions</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">Transactions that require human attention, with live SLA tracking.</p>
        </div>
        {canMutate && (
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            <Plus size={16} /> New Exception
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-ink-200 dark:border-ink-800" role="tablist" aria-label="Exception status">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${tab === t.key ? 'border-b-2 border-brand-600 text-brand-700 dark:text-brand-400' : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {actionError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{actionError}</p>}

      <DataState isLoading={isFetching && items.length === 0} isError={isError} error={error} empty={items.length === 0} emptyMessage="No exceptions in this view. Clean queue.">
        {/* Desktop table */}
        <div className="hidden overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-800 md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-900">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Exception</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Type</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-ink-600 dark:text-ink-300">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Severity</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Owner</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">SLA</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Status</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-600 dark:text-ink-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.exceptionId} className="border-t border-ink-200 last:border-0 dark:border-ink-800">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink-900 dark:text-white">{e.exceptionId}</p>
                    <p className="max-w-xs truncate text-xs text-ink-500 dark:text-ink-400">{e.reason}</p>
                  </td>
                  <td className="px-4 py-2.5 align-top">{String(e.type).replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2.5 text-right align-top">{formatMinor(e.amountMinor, e.currency)}</td>
                  <td className="px-4 py-2.5 align-top"><StatusBadge status={e.severity} /></td>
                  <td className="px-4 py-2.5 align-top text-xs">{e.assignedTo?.email ?? '—'}</td>
                  <td className="px-4 py-2.5 align-top"><SlaBadge sla={e.sla} /></td>
                  <td className="px-4 py-2.5 align-top"><StatusBadge status={e.status} /></td>
                  <td className="px-4 py-2.5 text-center align-top">
                    {canMutate && (e.status === 'open' || e.status === 'investigating') && (
                      <div className="flex justify-center gap-1">
                        <button onClick={() => run(() => assignMut.mutateAsync(e.exceptionId))} className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30" title="Assign to me">Assign</button>
                        {e.status === 'open' && (
                          <button onClick={() => run(() => investigateMut.mutateAsync(e.exceptionId))} className="rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30">Investigate</button>
                        )}
                        <button onClick={() => { setResolveTarget(e); setResolution(''); setResolveIgnore(false); }} className="rounded px-2 py-1 text-xs text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30">Resolve</button>
                      </div>
                    )}
                    {canMutate && (e.status === 'resolved' || e.status === 'ignored') && (
                      <button onClick={() => { setReopenTarget(e); setReopenReason(''); }} className="rounded px-2 py-1 text-xs text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800">Reopen</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {items.map((e) => (
            <div key={e.exceptionId} className="rounded-lg border border-ink-200 p-4 dark:border-ink-800">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-900 dark:text-white">{e.exceptionId}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">{String(e.type).replace(/_/g, ' ')}</p>
                </div>
                <SlaBadge sla={e.sla} />
              </div>
              <p className="mt-2 text-sm text-ink-700 dark:text-ink-300">{e.reason}</p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold">{formatMinor(e.amountMinor, e.currency)}</span>
                <StatusBadge status={e.status} />
              </div>
              {canMutate && (e.status === 'open' || e.status === 'investigating') && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => run(() => assignMut.mutateAsync(e.exceptionId))} className="flex-1 rounded-md border border-ink-300 px-3 py-2 text-xs font-medium dark:border-ink-700">Assign</button>
                  <button onClick={() => { setResolveTarget(e); setResolution(''); setResolveIgnore(false); }} className="flex-1 rounded-md bg-brand-600 px-3 py-2 text-xs font-medium text-white">Resolve</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </DataState>

      {/* Create modal */}
      <Modal open={createOpen} title="New Exception" onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreateOpen(false)} className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800">Cancel</button>
            <button onClick={submitCreate} disabled={createMut.isPending || !form.reason || !form.amountMinor} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {createMut.isPending ? 'Creating…' : 'Create Exception'}
            </button>
          </div>
        }>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Type</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900">
              {['unmatched_payment', 'duplicate_payment', 'failed_payment', 'partial_payment', 'amount_mismatch', 'unknown_customer', 'unknown_invoice', 'timeout', 'webhook_mismatch', 'status_mismatch'].map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Amount (major units)</span>
              <input type="number" step="0.01" min="0" value={form.amountMinor} onChange={(e) => setForm({ ...form, amountMinor: e.target.value })} className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Currency</span>
              <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Payment ID (optional)</span>
              <input value={form.paymentId} onChange={(e) => setForm({ ...form, paymentId: e.target.value })} className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Invoice ID (optional)</span>
              <input value={form.invoiceId} onChange={(e) => setForm({ ...form, invoiceId: e.target.value })} className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Reason</span>
            <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} maxLength={1000} className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900" />
          </label>
          {createMut.isError && <p className="text-sm text-red-600">{createMut.error?.message ?? 'Failed to create exception.'}</p>}
        </div>
      </Modal>

      {/* Resolve confirmation dialog (financial action, audited) */}
      <Modal open={resolveTarget !== null} title="Confirm Resolution" onClose={() => setResolveTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setResolveTarget(null)} className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800">Cancel</button>
            <button
              onClick={() => run(async () => {
                await resolveMut.mutateAsync({ exceptionId: resolveTarget!.exceptionId, resolution, ignore: resolveIgnore });
                setResolveTarget(null);
              })}
              disabled={resolveMut.isPending || resolution.trim().length < 3}
              className="flex items-center gap-2 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              <ShieldCheck size={16} /> {resolveIgnore ? 'Ignore' : 'Resolve'}
            </button>
          </div>
        }>
        <div className="space-y-4">
          <p className="text-sm text-ink-700 dark:text-ink-300">
            You are about to resolve <strong>{resolveTarget?.exceptionId}</strong> for{' '}
            <strong>{resolveTarget ? formatMinor(resolveTarget.amountMinor, resolveTarget.currency) : ''}</strong>. This action is audited.
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Resolution reason (required)</span>
            <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} maxLength={2000} className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={resolveIgnore} onChange={(e) => setResolveIgnore(e.target.checked)} />
            Mark as ignored instead of resolved
          </label>
        </div>
      </Modal>

      {/* Reopen dialog */}
      <Modal open={reopenTarget !== null} title="Reopen Exception" onClose={() => setReopenTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setReopenTarget(null)} className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800">Cancel</button>
            <button
              onClick={() => run(async () => {
                await reopenMut.mutateAsync({ exceptionId: reopenTarget!.exceptionId, reason: reopenReason });
                setReopenTarget(null);
              })}
              disabled={reopenMut.isPending || reopenReason.trim().length < 3}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Reopen
            </button>
          </div>
        }>
        <div className="space-y-4">
          <p className="text-sm text-ink-700 dark:text-ink-300">Reopening <strong>{reopenTarget?.exceptionId}</strong> returns it to the open queue with a fresh SLA.</p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Reopen reason (required)</span>
            <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={3} maxLength={1000} className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900" />
          </label>
        </div>
      </Modal>
    </motion.div>
  );
};

export default ExceptionsPage;