import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, RefreshCw, Send, Eye } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { DataState } from '../../components/DataState';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useRotateWebhookSecret,
  useTestWebhook,
  useWebhookDeliveries,
  useRetryDelivery,
} from '../../hooks/useEnterprise';
import type { WebhookEventType } from '../../types/billing';

export const WebhooksPage = () => {
  useDocumentTitle('Webhooks');
  const { data, isError, error, isFetching } = useWebhooks();
  const endpoints = data?.items ?? [];
  const availableEvents = data?.availableEvents ?? [];

  const createMut = useCreateWebhook();
  const updateMut = useUpdateWebhook();
  const rotateMut = useRotateWebhookSecret();
  const testMut = useTestWebhook();
  const retryMut = useRetryDelivery();

  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [events, setEvents] = useState<WebhookEventType[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const submit = async () => {
    await run(async () => {
      const result = await createMut.mutateAsync({ url, description: description || undefined, events });
      setRevealedSecret(result.secret);
      setCreateOpen(false);
      setUrl('');
      setDescription('');
      setEvents([]);
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Webhook Endpoints</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Payloads are signed (<code className="text-xs">X-LedgerGuard-Signature: t=…,v1=…</code>, HMAC-SHA256) and retried with exponential backoff.
          </p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> New Endpoint
        </button>
      </div>

      {actionError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{actionError}</p>}

      {revealedSecret && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">New signing secret — shown only once:</p>
          <code className="mt-2 block break-all rounded-md bg-white px-3 py-2 text-sm dark:bg-ink-900">{revealedSecret}</code>
        </div>
      )}

      <DataState isLoading={isFetching && !data} isError={isError} error={error} empty={endpoints.length === 0} emptyMessage="No webhook endpoints configured.">
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <div key={ep.endpointId} className="rounded-lg border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900 dark:text-white">{ep.url}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {ep.endpointId} · events: {ep.events.join(', ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={ep.active ? 'active' : 'disabled'} />
                  <button onClick={() => run(() => updateMut.mutateAsync({ endpointId: ep.endpointId, patch: { active: !ep.active } }))} className="rounded px-2 py-1 text-xs text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800">
                    {ep.active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => run(async () => setRevealedSecret(await rotateMut.mutateAsync(ep.endpointId)))} className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                    <RefreshCw size={12} className="mr-1 inline" /> Rotate secret
                  </button>
                  <button onClick={() => run(() => testMut.mutateAsync(ep.endpointId))} className="rounded px-2 py-1 text-xs text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30">
                    <Send size={12} className="mr-1 inline" /> Test
                  </button>
                  <button onClick={() => setSelectedEndpoint(selectedEndpoint === ep.endpointId ? null : ep.endpointId)} className="rounded px-2 py-1 text-xs text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800">
                    <Eye size={12} className="mr-1 inline" /> Deliveries
                  </button>
                </div>
              </div>
              {selectedEndpoint === ep.endpointId && <DeliveriesList endpointId={ep.endpointId} onRetry={(id) => run(() => retryMut.mutateAsync(id))} />}
            </div>
          ))}
        </div>
      </DataState>

      <Modal open={createOpen} title="New Webhook Endpoint" onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreateOpen(false)} className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800">Cancel</button>
            <button onClick={submit} disabled={createMut.isPending || !url.trim() || events.length === 0} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {createMut.isPending ? 'Creating…' : 'Create Endpoint'}
            </button>
          </div>
        }>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Payload URL (https required for remote hosts)</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/ledgerguard" className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Description (optional)</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900" />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700 dark:text-ink-200">Events</legend>
            <div className="grid grid-cols-2 gap-2">
              {availableEvents.filter((e) => e !== 'endpoint.test').map((e) => (
                <label key={e} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={events.includes(e)} onChange={() => setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]))} />
                  {e}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Modal>
    </motion.div>
  );
};

function DeliveriesList({ endpointId, onRetry }: { endpointId: string; onRetry: (deliveryId: string) => void }) {
  const { data: deliveries, isLoading } = useWebhookDeliveries(endpointId);
  if (isLoading) return <p className="mt-3 text-xs text-ink-500">Loading deliveries…</p>;
  if (!deliveries || deliveries.length === 0) return <p className="mt-3 text-xs text-ink-500">No deliveries yet.</p>;
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-ink-200 dark:border-ink-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-ink-50 dark:bg-ink-800">
            <th className="px-3 py-2 text-left">Event</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Attempts</th>
            <th className="px-3 py-2 text-left">HTTP</th>
            <th className="px-3 py-2 text-left">Latency</th>
            <th className="px-3 py-2 text-left">Next retry</th>
            <th className="px-3 py-2 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.deliveryId} className="border-t border-ink-100 dark:border-ink-800">
              <td className="px-3 py-2">{d.eventType}<br /><span className="text-ink-400">{d.eventId}</span></td>
              <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
              <td className="px-3 py-2">{d.attempts}</td>
              <td className="px-3 py-2">{d.responseStatus ?? '—'}</td>
              <td className="px-3 py-2">{d.latencyMs != null ? `${d.latencyMs}ms` : '—'}</td>
              <td className="px-3 py-2">{d.nextRetryAt ? new Date(d.nextRetryAt).toLocaleTimeString() : '—'}</td>
              <td className="px-3 py-2 text-center">
                {d.status !== 'pending' && d.status !== 'success' && (
                  <button onClick={() => onRetry(d.deliveryId)} className="rounded px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30">Retry</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default WebhooksPage;