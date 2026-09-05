import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { KeyRound, Webhook, BookOpen, Zap } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const SECTIONS = [
  { name: 'API Keys', to: '/developer/api-keys', icon: KeyRound, description: 'Create, rotate and revoke scoped API keys (hashed at rest).' },
  { name: 'Webhooks', to: '/developer/webhooks', icon: Webhook, description: 'Signed endpoints, event subscriptions, deliveries with retry.' },
  { name: 'API Documentation', to: '/developer#documentation', icon: BookOpen, description: 'Authentication, scopes, envelopes and idempotency.' },
  { name: 'Events', to: '/developer#events', icon: Zap, description: 'Every financial event emitted for webhook subscriptions.' },
];

export const DeveloperPortalPage = () => {
  useDocumentTitle('Developer Portal');
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Developer Portal</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Integrate with LedgerGuard programmatically — securely.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.name} to={s.to} className="rounded-lg border border-ink-200 bg-white p-5 transition hover:border-brand-400 dark:border-ink-800 dark:bg-ink-900">
              <Icon size={20} className="text-brand-600 dark:text-brand-400" />
              <p className="mt-2 font-semibold text-ink-900 dark:text-white">{s.name}</p>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{s.description}</p>
            </Link>
          );
        })}
      </div>

      {/* API reference */}
      <div id="documentation" className="rounded-lg border border-ink-200 p-5 dark:border-ink-800">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white">API Reference</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex gap-2"><dt className="w-40 font-medium text-ink-600 dark:text-ink-300">Version</dt><dd>1.0.0</dd></div>
          <div className="flex gap-2"><dt className="w-40 font-medium text-ink-600 dark:text-ink-300">Base URL</dt><dd><code>/api</code></dd></div>
          <div className="flex gap-2"><dt className="w-40 font-medium text-ink-600 dark:text-ink-300">Authentication</dt><dd>Bearer JWT or Bearer <code>lgk_…</code> API key</dd></div>
          <div className="flex gap-2"><dt className="w-40 font-medium text-ink-600 dark:text-ink-300">Error envelope</dt><dd><code>{'{ success:false, error:{ code, message, requestId } }'}</code></dd></div>
          <div className="flex gap-2"><dt className="w-40 font-medium text-ink-600 dark:text-ink-300">Idempotency</dt><dd>Payment keys &amp; webhook event IDs guarantee exactly-once processing</dd></div>
        </dl>
      </div>

      <div id="events" className="rounded-lg border border-ink-200 p-5 dark:border-ink-800">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Webhook Events</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {['invoice.created', 'invoice.updated', 'payment.created', 'payment.completed', 'payment.failed', 'ledger.created', 'refund.created', 'subscription.updated', 'alert.triggered', 'report.completed'].map((e) => (
            <code key={e} className="rounded bg-ink-100 px-2 py-1 text-xs dark:bg-ink-800">{e}</code>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default DeveloperPortalPage;