import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { systemService, type WorkerRunTelemetry } from '../../services/system.service';
import { useAuthStore } from '../../store/authStore';
import { UserRole } from '@ledgerguard/shared';

/** Aggregate status label — never communicated by colour alone (Part 29). */
type Status = 'Operational' | 'Degraded' | 'Down' | 'Unknown' | 'Disabled';

function statusFor(entry: WorkerRunTelemetry): Status {
  if (!entry.enabled) return 'Disabled';
  if (entry.lastOk === true) return 'Operational';
  if (entry.lastOk === false) return 'Degraded';
  return 'Unknown';
}

const STATUS_STYLES: Record<Status, string> = {
  Operational: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  Degraded: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Down: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Unknown: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
  Disabled: 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400',
};

function Pill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      <span aria-hidden="true" className="mr-1">●</span>
      {status}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-950"
      aria-label={title}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm text-ink-600 dark:text-ink-400">{label}</dt>
      <dd className={`text-sm font-medium text-ink-900 dark:text-white ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SystemHealthPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === UserRole.SuperAdmin;
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['system', 'health'],
    queryFn: async () => {
      const result = await systemService.detailedHealth();
      setLastChecked(new Date().toLocaleTimeString());
      return result;
    },
    enabled: isSuperAdmin,
    refetchInterval: 30_000,
    retry: 1,
  });

  if (!isSuperAdmin) {
    return (
      <div
        className="mx-auto max-w-md rounded-xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-700 dark:bg-amber-900/20"
        role="alert"
      >
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-ink-900 dark:text-white">Restricted area</h1>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">
          System health details are only available to platform administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900 dark:text-white">System Health</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400" aria-live="polite">
            {lastChecked ? `Last checked ${lastChecked}` : 'Checking subsystems…'}
          </p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
          aria-label="Refresh health check"
        >
          <RefreshCw size={15} className={isRefetching ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {isLoading && (
        <p className="rounded-xl border border-ink-200 p-6 text-center text-sm text-ink-500 dark:border-ink-800" role="status">
          Loading health information…
        </p>
      )}

      {isError && (
        <p
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
          role="alert"
        >
          Health data is unavailable right now. {(error as Error | null)?.message ?? ''}
        </p>
      )}

      {data && (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-950">
            <Pill status={data.dependencies.database.ok ? 'Operational' : 'Degraded'} />
            <span className="text-sm text-ink-600 dark:text-ink-400">
              Overall status computed from live dependency checks at{' '}
              <time dateTime={data.timestamp}>{new Date(data.timestamp).toLocaleString()}</time>
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="API">
              <dl>
                <Row label="Service" value={`${data.service} v${data.version}`} />
                <Row label="Environment" value={data.env} />
                <Row label="Node.js" value={data.node} />
                <Row label="Uptime" value={formatUptime(data.uptimeSeconds)} />
                <Row label="Memory (RSS / heap)" value={`${data.memory.rssMb} MB / ${data.memory.heapUsedMb} MB`} />
                <Row label="Request ID" value={data.requestId ?? '—'} mono />
              </dl>
            </Section>

            <Section title="Database">
              <dl>
                <Row label="State" value={<Pill status={data.dependencies.database.ok ? 'Operational' : 'Down'} />} />
                <Row
                  label="Latency"
                  value={data.dependencies.database.latencyMs != null ? `${data.dependencies.database.latencyMs} ms` : '—'}
                />
                <Row
                  label="Transactions"
                  value={data.dependencies.database.transactionsSupported ? 'Supported' : 'Not supported (single-node mode)'}
                />
                <Row
                  label="Tenant connections"
                  value={`${data.tenantConnections.active} active of ${data.tenantConnections.max} max`}
                />
              </dl>
            </Section>

            <Section title="Redis & Policies">
              <dl>
                <Row
                  label="State"
                  value={
                    <Pill
                      status={
                        !data.dependencies.redis.enabled
                          ? 'Disabled'
                          : data.dependencies.redis.state === 'ready'
                            ? 'Operational'
                            : 'Degraded'
                      }
                    />
                  }
                />
                <Row
                  label="Latency"
                  value={data.dependencies.redis.latencyMs != null ? `${data.dependencies.redis.latencyMs} ms` : '—'}
                />
                <Row label="Lock failure policy" value={data.dependencies.lockFailurePolicy} />
                <Row
                  label="Dev simulation"
                  value={data.dependencies.devSimulationEnabled ? 'Enabled (development)' : 'Off'}
                />
              </dl>
            </Section>

            <Section title="Realtime">
              <dl>
                <Row label="Socket.IO" value={<Pill status={data.sockets.ready ? 'Operational' : 'Down'} />} />
                <Row label="Connected clients" value={String(data.sockets.connectedClients)} />
              </dl>
            </Section>

            <Section title="Background workers">
              {data.workers.length === 0 ? (
                <p className="text-sm text-ink-500 dark:text-ink-400">No background jobs registered.</p>
              ) : (
                <table className="w-full text-sm" aria-label="Background job health">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
                      <th scope="col" className="py-1">Job</th>
                      <th scope="col" className="py-1">Status</th>
                      <th scope="col" className="py-1">Last finished</th>
                      <th scope="col" className="py-1">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.workers.map((w) => (
                      <tr key={w.name} className="border-t border-ink-100 dark:border-ink-800">
                        <td className="py-1.5 font-medium text-ink-900 dark:text-white">{w.name}</td>
                        <td className="py-1.5"><Pill status={statusFor(w)} /></td>
                        <td className="py-1.5 text-xs text-ink-600 dark:text-ink-300">
                          {w.lastFinishedAt ? new Date(w.lastFinishedAt).toLocaleString() : 'Never'}
                        </td>
                        <td className="py-1.5 text-xs tabular-nums text-ink-600 dark:text-ink-300">
                          {w.lastDurationMs != null ? `${w.lastDurationMs} ms` : '—'}
                          {w.lastError && (
                            <span className="ml-2 font-semibold text-red-600 dark:text-red-400" title={w.lastError}>
                              failed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
