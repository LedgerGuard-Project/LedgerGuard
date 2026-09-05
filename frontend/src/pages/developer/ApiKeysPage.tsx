import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, KeyRound, Copy, Check } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { DataState } from '../../components/DataState';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { useApiKeys, useCreateApiKey, useRevokeApiKey, useRotateApiKey } from '../../hooks/useEnterprise';
import { formatDate } from '../../utils/format';
import type { ApiKeyPermission } from '../../types/billing';

const PERMISSIONS: Array<{ key: ApiKeyPermission; label: string; hint: string }> = [
  { key: 'READ', label: 'Read', hint: 'Read-only access to billing data' },
  { key: 'WRITE', label: 'Write', hint: 'Create/update customers and drafts' },
  { key: 'BILLING', label: 'Billing', hint: 'Invoices, notes, recurring billing' },
  { key: 'PAYMENTS', label: 'Payments', hint: 'Record payments and refunds' },
  { key: 'REPORTS', label: 'Reports', hint: 'Access report endpoints' },
  { key: 'WEBHOOKS', label: 'Webhooks', hint: 'Manage webhook endpoints' },
  { key: 'ADMIN', label: 'Admin', hint: 'Tenant administration (elevated)' },
];

export const ApiKeysPage = () => {
  useDocumentTitle('API Keys');
  const { data: keys, isError, error, isFetching } = useApiKeys();
  const createMut = useCreateApiKey();
  const revokeMut = useRevokeApiKey();
  const rotateMut = useRotateApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<ApiKeyPermission[]>(['READ']);
  const [expiresAt, setExpiresAt] = useState('');
  const [revealed, setRevealed] = useState<{ rawKey: string; copied: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggle = (p: ApiKeyPermission) =>
    setSelected((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const submit = async () => {
    setActionError(null);
    try {
      const result = await createMut.mutateAsync({
        name,
        permissions: selected,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      setRevealed({ rawKey: result.rawKey, copied: false });
      setCreateOpen(false);
      setName('');
      setSelected(['READ']);
      setExpiresAt('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create key');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">API Keys</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Keys are stored as SHA-256 hashes — the raw key is shown <strong>only once</strong> at creation.
          </p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus size={16} /> Create API Key
        </button>
      </div>

      {actionError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{actionError}</p>}

      {revealed && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300"><KeyRound size={16} /> Copy your API key now — it will not be shown again</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-white px-3 py-2 text-sm dark:bg-ink-900">{revealed.rawKey}</code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(revealed.rawKey);
                setRevealed({ ...revealed, copied: true });
              }}
              className="rounded-md border border-ink-300 p-2 dark:border-ink-700"
              aria-label="Copy API key"
            >
              {revealed.copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      )}

      <DataState isLoading={isFetching && !keys} isError={isError} error={error} empty={(keys ?? []).length === 0} emptyMessage="No API keys yet. Create one to grant programmatic access.">
        <div className="overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-900">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Key</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Permissions</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Expires</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Last used</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Status</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-600 dark:text-ink-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(keys ?? []).map((k) => (
                <tr key={k.keyId} className="border-t border-ink-200 last:border-0 dark:border-ink-800">
                  <td className="px-4 py-2.5 font-medium text-ink-900 dark:text-white">{k.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{k.displayPrefix}</td>
                  <td className="px-4 py-2.5 text-xs">{k.permissions.join(', ')}</td>
                  <td className="px-4 py-2.5 text-xs">{k.expiresAt ? formatDate(k.expiresAt) : 'Never'}</td>
                  <td className="px-4 py-2.5 text-xs">{k.lastUsedAt ? formatDate(k.lastUsedAt) : 'Never'}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={k.revokedAt ? 'revoked' : 'active'} /></td>
                  <td className="px-4 py-2.5 text-center">
                    {!k.revokedAt && (
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => {
                            setActionError(null);
                            rotateMut.mutateAsync(k.keyId).then((r) => setRevealed({ rawKey: r.rawKey, copied: false })).catch((e) => setActionError(e instanceof Error ? e.message : 'Rotate failed'));
                          }}
                          className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                        >
                          Rotate
                        </button>
                        <button
                          onClick={() => {
                            setActionError(null);
                            revokeMut.mutateAsync(k.keyId).catch((e) => setActionError(e instanceof Error ? e.message : 'Revoke failed'));
                          }}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                          Revoke
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>

      <Modal open={createOpen} title="Create API Key" onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreateOpen(false)} className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800">Cancel</button>
            <button onClick={submit} disabled={createMut.isPending || !name.trim() || selected.length === 0} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {createMut.isPending ? 'Creating…' : 'Create Key'}
            </button>
          </div>
        }>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Key name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ERP integration" className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900" />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700 dark:text-ink-200">Permissions (least privilege)</legend>
            <div className="space-y-2">
              {PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.includes(p.key)} onChange={() => toggle(p.key)} />
                  <span className="font-medium">{p.label}</span>
                  <span className="text-xs text-ink-500 dark:text-ink-400">{p.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Expiration (optional)</span>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900" />
          </label>
        </div>
      </Modal>
    </motion.div>
  );
};

export default ApiKeysPage;