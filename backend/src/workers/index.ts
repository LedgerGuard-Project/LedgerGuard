import { config } from '../config';
import { logger } from '../utils/logger';
import { tenantConnectionManager } from '../database';
import { refreshOverdue } from '../services/billing/invoice.service';
import { processDuePlans } from '../services/billing/recurring.service';

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

export async function startWorkers(): Promise<void> {
  if (!config.redisEnabled) {
    logger.info('Workers skipped (REDIS_ENABLED=false)');
    return;
  }
  logger.info(`Starting ${jobs.length + 1} background worker(s)`);
  // Register the recurring generation sweep once.
  registerWorker({ name: 'recurring.generate', run: runRecurringWorker });
  // Run a first sweep immediately, then periodically.
  const sweep = async (): Promise<void> => {
    await runOverdueWorker();
    await runRecurringWorker();
    setTimeout(() => void sweep(), 60 * 60 * 1000); // hourly
  };
  void sweep();
  await Promise.all(jobs.map((job) => job.run()));
}

export function getWorkers(): Job[] {
  return jobs;
}