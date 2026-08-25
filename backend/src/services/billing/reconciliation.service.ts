import type { ReconciliationDiscrepancy, ReconciliationRun } from '@ledgerguard/shared';
import type { InvoiceStatus } from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import { ApiError } from '../../utils/ApiError';
import { newReconciliationId } from '../../utils/ids';
import { distributedLockService, LockError } from '../DistributedLockService';
import {
  beginIdempotency,
  completeIdempotency,
  failIdempotency,
  hashRequest,
} from '../idempotency.service';
import { transactionsSupported } from './payment.service';
import { writeAudit } from '../audit.service';
import { emitTenantEvent } from '../../sockets/eventBus';
import { AuditAction, SOCKET_EVENTS } from '@ledgerguard/shared';
import { logger } from '../../utils/logger';

export interface ReconcileInput {
  /** When true, best-effort corrections are applied (idempotent). */
  repair?: boolean;
  idempotencyKey: string;
}

export interface ReconciliationResult {
  run?: ReconciliationRun;
  idempotencyKey: string;
  idempotencyStatus: 'completed' | 'processing';
  replay?: boolean;
  degraded?: boolean;
}

interface Actor {
  id: string;
  email: string;
}

interface Meta {
  ip?: string;
  userAgent?: string;
}

/**
 * Reconcile the tenant's billing ledger against its source-of-truth aggregates.
 *
 * The run is idempotent (same Idempotency-Key replays the stored result) and
 * serialized by the distributed lock — mirroring the payment engine.
 */
export async function reconcileBillingLedger(
  connection: import('mongoose').Connection,
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  input: ReconcileInput,
  meta: Meta = {},
): Promise<ReconciliationResult> {
  const run = async (): Promise<ReconciliationResult> => {
    const requestHash = hashRequest({ repair: Boolean(input.repair) });
    const idem = await beginIdempotency(models, tenantId, input.idempotencyKey, requestHash);

    if (idem.kind === 'replay') {
      const snapshot = (idem.response ?? {}) as ReconciliationResult;
      return {
        ...snapshot,
        idempotencyKey: input.idempotencyKey,
        idempotencyStatus: 'completed',
        replay: true,
      };
    }
    if (idem.kind === 'in_progress') {
      return { idempotencyKey: input.idempotencyKey, idempotencyStatus: 'processing' };
    }

    try {
      const repair = Boolean(input.repair) && (await transactionsSupported(connection));
      const result = await runChecks(models, tenantId, input.idempotencyKey, repair);

      const payload: ReconciliationResult = {
        run: result,
        idempotencyKey: input.idempotencyKey,
        idempotencyStatus: 'completed',
      };
      await completeIdempotency(idem.record, payload, result.reconciliationId);

      emitTenantEvent(tenantId, SOCKET_EVENTS.ledgerUpdated, { tenantId });
      emitTenantEvent(tenantId, SOCKET_EVENTS.ledgerReconciled, {
        reconciliationId: result.reconciliationId,
        status: result.status,
        discrepancyCount: result.discrepancyCount,
        repairApplied: result.repairApplied,
        checkedAt: result.checkedAt,
      });

      if (result.discrepancyCount > 0 || result.repairApplied) {
        await writeAudit({
          tenantId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: AuditAction.LedgerReconciled,
          resource: 'ledger',
          resourceId: result.reconciliationId,
          details: {
            status: result.status,
            discrepancyCount: result.discrepancyCount,
            repairedCount: result.repairedCount,
            repairRequested: result.repairRequested,
            discrepancyChecks: result.discrepancies.map((d) => d.check),
          },
          ip: meta.ip,
          userAgent: meta.userAgent,
        }).catch((auditErr) => logger.warn('audit LedgerReconciled failed', { auditErr }));
      }

      return payload;
    } catch (err) {
      await failIdempotency(idem.record).catch(() => undefined);
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        'Reconciliation failed; ledger state was checked asynchronously. Retry with the same Idempotency-Key.',
        500,
        'RECONCILIATION_FAILED',
        { original: err instanceof Error ? err.message : String(err) },
      );
    }
  };

  try {
    const { result, degraded } = await distributedLockService.withLock(
      tenantId,
      input.idempotencyKey,
      run,
    );
    if (degraded) result.degraded = true;
    return result;
  } catch (err) {
    if (err instanceof LockError) {
      throw err.reason === 'contention'
        ? ApiError.conflict('This reconciliation is already being processed', 'LOCK_CONTENTION')
        : new ApiError(
            'Distributed locking is unavailable (Redis is down) and the failure policy is fail_closed',
            503,
            'LOCK_UNAVAILABLE',
          );
    }
    throw err;
  }
}

/** Load the stored result of a prior reconciliation by its Idempotency-Key. */
export async function getReconciliationByKey(
  models: BillingModels,
  tenantId: string,
  key: string,
): Promise<ReconciliationResult | null> {
  const record = await models.IdempotencyRecord.findOne({ tenantId, key, status: 'completed' });
  if (!record?.response) return null;
  return record.response as ReconciliationResult;
}

async function runChecks(
  models: BillingModels,
  tenantId: string,
  _idempotencyKey: string,
  repair: boolean,
): Promise<ReconciliationRun> {
  const reconciliationId = newReconciliationId();
  const checkedAt = new Date().toISOString();
  const discrepancies: ReconciliationDiscrepancy[] = [];

  const transactions = await models.LedgerTransaction.find({ tenantId }, { transactionId: 1 });
  const validIds = new Set(transactions.map((t) => t.transactionId));

  // ---- 1. unbalanced_entries (per transaction across ALL entry types) ----
  const unbalanced = (await models.LedgerEntry.aggregate([
    { $match: { tenantId } },
    {
      $group: {
        _id: '$transactionId',
        net: {
          $sum: {
            $cond: [{ $eq: ['$direction', 'debit'] }, '$amountMinor', { $multiply: ['$amountMinor', -1] }],
          },
        },
        debits: { $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, '$amountMinor', 0] } },
        credits: { $sum: { $cond: [{ $eq: ['$direction', 'credit'] }, '$amountMinor', 0] } },
      },
    },
  ])) as Array<{ _id: string; net: number; debits: number; credits: number }>;

  for (const group of unbalanced) {
    const net = Number(group.net ?? 0);
    if (net !== 0) {
      discrepancies.push({
        check: 'unbalanced_entries',
        severity: 'error',
        entityType: 'transaction',
        entityId: group._id,
        message: `Transaction posting is unbalanced: debits (${group.debits}) != credits (${group.credits})`,
        expectedMinor: net,
        actualMinor: 0,
        repaired: false,
      });
    }
  }

  // ---- 2. orphan_entries (dangling rows referencing a missing transaction) ----
  const entryGroups = (await models.LedgerEntry.aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$transactionId' } },
  ])) as Array<{ _id: string }>;

  for (const group of entryGroups) {
    if (!validIds.has(group._id)) {
      discrepancies.push({
        check: 'orphan_entries',
        severity: 'error',
        entityType: 'entry',
        entityId: group._id,
        message: `Ledger entries reference a transaction (${group._id}) that does not exist.`,
        repaired: false,
      });
    }
  }

  // ---- 3. account_balance (net of customer_account entries per account) ----
  const balanceNets = (await models.LedgerEntry.aggregate([
    { $match: { tenantId, entryType: 'customer_account' } },
    {
      $group: {
        _id: '$accountId',
        net: {
          $sum: {
            $cond: [{ $eq: ['$direction', 'debit'] }, '$amountMinor', { $multiply: ['$amountMinor', -1] }],
          },
        },
      },
    },
  ])) as Array<{ _id: string; net: number }>;
  const netByAccount = new Map<string, number>();
  for (const row of balanceNets) netByAccount.set(row._id, Number(row.net ?? 0));

  const accounts = await models.BillingAccount.find({ tenantId });
  for (const accountId of netByAccount.keys()) {
    const account = accounts.find((a) => a.accountId === accountId);
    if (!account) continue;
    const expected = netByAccount.get(accountId) ?? 0;
    const actual = account.balanceMinor;
    if (expected !== actual) {
      discrepancies.push({
        check: 'account_balance',
        severity: 'error',
        entityType: 'account',
        entityId: accountId,
        message: `Account ${accountId} balanceMinor is ${actual} but its journal net is ${expected}.`,
        expectedMinor: expected,
        actualMinor: actual,
        repaired: false,
      });
    }
  }

  // ---- 4. invoice_settlement (stored status vs. net completed payments) ----
  const paymentNets = (await models.LedgerTransaction.aggregate([
    { $match: { tenantId, invoiceId: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: '$invoiceId',
        net: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'refund'] },
              { $multiply: ['$amountMinor', -1] },
              { $cond: [{ $eq: ['$status', 'completed'] }, '$amountMinor', 0] },
            ],
          },
        },
      },
    },
  ])) as Array<{ _id: string | null; net: number }>;
  const netByInvoice = new Map<string, number>();
  for (const row of paymentNets) {
    if (row._id) netByInvoice.set(row._id, Number(row.net ?? 0));
  }

  const expectedInvoiceStatus = (invoice: { status: string; totalMinor: number; invoiceId: string }): InvoiceStatus => {
    const net = netByInvoice.get(invoice.invoiceId) ?? 0;
    if (net <= 0) return 'issued';
    if (net < invoice.totalMinor) return 'partially_paid';
    return 'paid';
  };

  const invoices = await models.Invoice.find({ tenantId });
  for (const invoice of invoices) {
    if (invoice.status === 'cancelled' || invoice.status === 'draft') continue;
    const expected = expectedInvoiceStatus(invoice);
    if (invoice.status === expected) continue;
    discrepancies.push({
      check: 'invoice_settlement',
      severity: 'error',
      entityType: 'invoice',
      entityId: invoice.invoiceId,
      message: `Invoice ${invoice.invoiceId} is ${invoice.status} but its completed payments net ${netByInvoice.get(invoice.invoiceId) ?? 0} of ${invoice.totalMinor}.`,
      expectedMinor: netByInvoice.get(invoice.invoiceId) ?? 0,
      actualMinor: invoice.totalMinor,
      repaired: false,
    });
  }

  // ---- Repair (best effort; only when requested AND transactions supported) ----
  let repairApplied = false;
  let repairedCount = 0;

  if (repair) {
    // (a) orphan_entries -> delete dangling rows whose source transaction is gone.
    const orphanIds = entryGroups.map((r) => r._id).filter((id) => !validIds.has(id));
    if (orphanIds.length) {
      const del = await models.LedgerEntry.deleteMany({ tenantId, transactionId: { $in: orphanIds } });
      if (del.deletedCount) {
        repairedCount += del.deletedCount;
        repairApplied = true;
      }
    }
    for (const d of discrepancies) if (d.check === 'orphan_entries') d.repaired = true;

    // (b) account_balance -> recompute balanceMinor from the customer_account journal.
    const repairedAccounts = new Set<string>();
    for (const accountId of netByAccount.keys()) {
      const account = accounts.find((a) => a.accountId === accountId);
      if (!account) continue;
      const expected = netByAccount.get(accountId) ?? 0;
      if (account.balanceMinor !== expected) {
        account.balanceMinor = expected;
        await account.save();
        repairedCount++;
        repairApplied = true;
        repairedAccounts.add(accountId);
      }
    }
    for (const d of discrepancies) {
      if (d.check === 'account_balance' && repairedAccounts.has(d.entityId)) d.repaired = true;
    }

    // (c) invoice_settlement -> set stored status to the derived state.
    const repairedInvoices = new Set<string>();
    for (const invoice of invoices) {
      if (invoice.status === 'cancelled' || invoice.status === 'draft') continue;
      const expected = expectedInvoiceStatus(invoice);
      if (invoice.status === expected) continue;
      invoice.status = expected;
      if (expected === 'paid') invoice.paidAt = new Date();
      await invoice.save();
      repairedCount++;
      repairApplied = true;
      repairedInvoices.add(invoice.invoiceId);
    }
    for (const d of discrepancies) {
      if (d.check === 'invoice_settlement' && repairedInvoices.has(d.entityId)) d.repaired = true;
    }

    // (d) unbalanced_entries -> not auto-repairable safely; requires review.
    // The discrepancy stays flagged with repaired: false.
  }

  const errorCount = discrepancies.filter((d) => d.severity === 'error').length;
  const status =
    repairApplied
      ? 'repaired'
      : errorCount > 0
        ? 'discrepancies'
        : discrepancies.length > 0
          ? 'unclean'
          : 'clean';

  return {
    id: reconciliationId,
    reconciliationId,
    tenantId,
    status,
    checkedAt,
    repairRequested: repair,
    repairApplied,
    totalChecks: 4,
    discrepancyCount: discrepancies.length,
    repairedCount,
    discrepancies,
  };
}