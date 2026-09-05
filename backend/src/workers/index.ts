import { config } from '../config';
import { logger } from '../utils/logger';
import { tenantConnectionManager } from '../database';
import { refreshOverdue } from '../services/billing/invoice.service';
import { processDuePlans } from '../services/billing/recurring.service';
import { processWebhookRetries } from '../services/billing/webhook.service';

export interface Job {
  name: string;
  run(): Promise<void>;
}

/**
 * Background worker registry. When REDIS is enabled these jobs can be
 * scheduled on a queue; otherwise they are no-ops.
 */
const jobs: Job[] = [];

export function registerWorker(job: Job): void {
  jobs.push(job);
}

// ---- Run telemetry (exposed via GET /health for super admins) ----

/** Outcome of the most recent execution of a background job. */
export interface WorkerRunTelemetry {
  name: string;
  enabled: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastOk: boolean | null;
  lastDurationMs: number | null;
  lastError: string | null;
}

const telemetry = new Map<string, WorkerRunTelemetry>();

function ensureTelemetry(name: string): WorkerRunTelemetry {
  let entry = telemetry.get(name);
  if (!entry) {
    entry = {
      name,
      enabled: config.redisEnabled,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastOk: null,
      lastDurationMs: null,
      lastError: null,
    };
    telemetry.set(name, entry);
  }
  return entry;
}

/** Execute a job while recording duration/status into the telemetry map. */
async function tracked(name: string, fn: () => Promise<void>): Promise<void> {
  const entry = ensureTelemetry(name);
  const startedAt = new Date().toISOString();
  const start = performance.now();
  entry.lastStartedAt = startedAt;
  entry.lastFinishedAt = null;
  entry.lastOk = null;
  try {
    await fn();
    entry.lastOk = true;
    entry.lastDurationMs = Math.round(performance.now() - start);
    entry.lastFinishedAt = new Date().toISOString();
    entry.lastError = null;
  } catch (err) {
    entry.lastOk = false;
    entry.lastDurationMs = Math.round(performance.now() - start);
    entry.lastFinishedAt = new Date().toISOString();
    entry.lastError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/** Periodically flag issued invoices whose due date has passed. */
async function runOverdueWorker(): Promise<void> {
  const tenants = tenantConnectionManager.connectionPool();
  for (const tenantId of tenants) {
    const models = tenantConnectionManager.getModels(tenantId);
    if (!models) continue;
    try {
      const updated = await refreshOverdue(models.billing, tenantId);
      if (updated > 0) {
        logger.info(`Overdue worker flagged ${updated} invoice(s) for tenant ${tenantId}`);
      }
    } catch (err) {
      logger.warn(`Overdue worker failed for tenant ${tenantId}`, { err });
    }
  }
}

/**
 * Generate invoices for due recurring plans. Each plan+cycle is lock-guarded
 * and advances its schedule atomically, so a concurrent sweep can never
 * produce duplicate invoices for the same billing cycle.
 */
async function runRecurringWorker(): Promise<void> {
  const tenants = tenantConnectionManager.connectionPool();
  for (const tenantId of tenants) {
    const models = tenantConnectionManager.getModels(tenantId);
    if (!models) continue;
    try {
      const outcome = await processDuePlans(models.billing, tenantId, {
        id: 'recurring-worker',
        email: 'recurring@ledgerguard',
      });
      if (outcome.generated.length > 0) {
        logger.info(
          `Recurring worker generated ${outcome.generated.length} invoice(s) for tenant ${tenantId}`,
        );
      }
    } catch (err) {
      logger.warn(`Recurring worker failed for tenant ${tenantId}`, { err });
    }
  }
}

/** Re-attempt webhook deliveries that are due (idempotent, records outcomes). */
async function runWebhookRetryWorker(): Promise<void> {
  const { retried } = await processWebhookRetries();
  if (retried > 0) {
    logger.info(`Webhook retry worker re-attempted ${retried} delivery(ies)`);
  }
}

/**
 * Webhook retries must run regardless of Redis availability (they are part of
 * the delivery guarantee, not a Redis-queue feature). Fixed 60s sweep.
 */
function scheduleWebhookRetries(): void {
  ensureTelemetry('webhook.retry');
  const sweep = async (): Promise<void> => {
    try {
      await tracked('webhook.retry', runWebhookRetryWorker);
    } catch (err) {
      logger.warn('Webhook retry sweep failed', { err });
    }
    setTimeout(() => void sweep(), 60_000);
  };
  void sweep();
}

export async function startWorkers(): Promise<void> {
  if (!config.redisEnabled) {
    logger.info('Workers skipped (REDIS_ENABLED=false)');
    scheduleWebhookRetries();
    return;
  }
  // Register every scheduled job exactly once; the sweep iterates the registry.
  registerWorker({ name: 'overdue.refresh', run: runOverdueWorker });
  registerWorker({ name: 'recurring.generate', run: runRecurringWorker });
  registerWorker({ name: 'webhook.retry', run: runWebhookRetryWorker });
  logger.info(`Starting ${jobs.length} background worker(s)`);
  ensureTelemetry('overdue.refresh');
  ensureTelemetry('recurring.generate');
  // Single scheduler loop: first pass runs immediately, then hourly.
  // (Previously the first pass ALSO ran every job again via Promise.all below,
  // executing the recurring worker twice on boot — fixed in Phase 4.)
  const sweep = async (): Promise<void> => {
    for (const job of jobs) {
      try {
        await tracked(job.name, job.run);
      } catch (err) {
        logger.warn(`Background job "${job.name}" failed`, { err });
      }
    }
    setTimeout(() => void sweep(), 60 * 60 * 1000); // hourly
  };
  void sweep();
}

export function getWorkers(): Job[] {
  return jobs;
}

/** Snapshot of background-job health for observability endpoints. */
export function workerHealth(): WorkerRunTelemetry[] {
  // Surface registry jobs that have never been swept, too.
  for (const job of jobs) ensureTelemetry(job.name);
  return Array.from(telemetry.values());
}