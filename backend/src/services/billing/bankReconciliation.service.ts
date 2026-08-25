import type { BillingModels } from '../../models/billing';
import {
  SOCKET_EVENTS,
  type BankTransactionStatus,
  type ImportSummary,
  type ReconciliationDashboard,
} from '@ledgerguard/shared';
import { ApiError } from '../../utils/ApiError';
import { newBankBatchId, newBankTransactionId } from '../../utils/ids';
import { writeAudit } from '../audit.service';
import { emitTenantEvent } from '../../sockets/eventBus';
import { AuditAction } from '@ledgerguard/shared';
import { logger } from '../../utils/logger';

export interface BankImportRow {
  reference?: string;
  description?: string;
  /** Major-unit amount, e.g. 125.50 */
  amount: number;
  currency: string;
  /** ISO date string or Date */
  date: string;
}

export interface MatchResult {
  bankTransactionId: string;
  ledgerTransactionId?: string;
  status: BankTransactionStatus;
  matched?: boolean;
  mismatchReason?: string;
}

/**
 * Import bank statement rows into the reconciliation workspace and run
 * automatic matching against the tenant's LedgerTransactions.
 *
 * Matching strategy (strict, in order):
 *  1. exact externalReference match (case-insensitive)
 *  2. exact (amountMinor, transactionDate same day) match
 * Falls back to `unmatched` when nothing matches. Rows can later be matched,
 * unmatched, ignored, or annotated manually by authorized users.
 */
export async function importBankRows(
  models: BillingModels,
  tenantId: string,
  actor: { id: string; email: string },
  rows: BankImportRow[],
  meta: { ip?: string; userAgent?: string } = {},
): Promise<ImportSummary> {
  if (rows.length === 0) {
    throw ApiError.badRequest('CSV import contained no rows', 'EMPTY_IMPORT');
  }
  const batchId = newBankBatchId();
  let matchedAutomatically = 0;

  const completedCharges = await models.LedgerTransaction.find(
    { tenantId, type: 'charge', status: 'completed' },
    { reference: 1, amountMinor: 1, currency: 1, createdAt: 1, transactionId: 1 },
  );

  const byRef = new Map<string, typeof completedCharges[number]>();
  for (const tx of completedCharges) {
    if (tx.reference) byRef.set(tx.reference.toLowerCase(), tx);
  }

  const createRows = rows.map((row, i) => {
    const currency = row.currency.toUpperCase().trim();
    const amountMinor = Math.round(Number(row.amount) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor < 0) {
      throw ApiError.badRequest(`Row ${i + 1}: invalid amount`, 'INVALID_AMOUNT');
    }
    const date = new Date(row.date);
    if (Number.isNaN(date.getTime())) {
      throw ApiError.badRequest(`Row ${i + 1}: invalid date`, 'INVALID_DATE');
    }
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const ref = row.reference?.trim();
    let match: { transactionId: string; amountMinor: number } | null = null;
    if (ref) {
      const byRefHit = byRef.get(ref.toLowerCase());
      if (byRefHit) {
        match = { transactionId: byRefHit.transactionId, amountMinor: byRefHit.amountMinor };
      }
    }
    if (!match) {
      // amount + same-day date fallback
      const dayHit = completedCharges.find(
        (tx) =>
          tx.amountMinor === amountMinor &&
          new Date(tx.createdAt).toISOString().slice(0, 10) === date.toISOString().slice(0, 10),
      );
      if (dayHit) match = { transactionId: dayHit.transactionId, amountMinor: dayHit.amountMinor };
    }

    const isMismatch =
      match !== null && amountMinor !== match.amountMinor;

    let status: BankTransactionStatus = 'unmatched';
    if (match && !isMismatch) {
      status = 'matched';
      matchedAutomatically++;
    } else if (match && isMismatch) {
      status = 'mismatch';
    }

    return {
      bankTransactionId: newBankTransactionId(),
      tenantId,
      batchId,
      externalReference: ref,
      description: row.description?.trim(),
      amountMinor,
      currency,
      transactionDate: date,
      ledgerTransactionId: match && !isMismatch ? match.transactionId : undefined,
      status,
      matchConfidence: match ? ('auto' as const) : undefined,
    };
  });

  await models.BankTransaction.insertMany(createRows);

  await writeAudit({
    tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.ReconciliationImported,
    resource: 'reconciliation',
    resourceId: batchId,
    details: { rows: rows.length, matchedAutomatically },
    ip: meta.ip,
    userAgent: meta.userAgent,
  }).catch((auditErr) => logger.warn('audit ReconciliationImported failed', { auditErr }));

  emitTenantEvent(tenantId, SOCKET_EVENTS.reconciliationMatched, {
    batchId,
    matched: matchedAutomatically,
  });

  return { imported: rows.length, matchedAutomatically, batchId };
}

/** Reconciliation dashboard aggregates. */
export async function reconciliationDashboard(
  models: BillingModels,
  tenantId: string,
): Promise<ReconciliationDashboard> {
  const [total, matched, unmatched, mismatch, manuallyMatched, ignored] =
    await Promise.all([
      models.BankTransaction.countDocuments({ tenantId }),
      models.BankTransaction.countDocuments({ tenantId, status: 'matched' }),
      models.BankTransaction.countDocuments({ tenantId, status: 'unmatched' }),
      models.BankTransaction.countDocuments({ tenantId, status: 'mismatch' }),
      models.BankTransaction.countDocuments({ tenantId, status: 'manually_matched' }),
      models.BankTransaction.countDocuments({ tenantId, status: 'ignored' }),
    ]);

  const [reconciledAgg, unreconciledAgg] = await Promise.all([
    models.BankTransaction.aggregate([
      { $match: { tenantId, status: { $in: ['matched', 'manually_matched'] } } },
      { $group: { _id: null, total: { $sum: '$amountMinor' } } },
    ]),
    models.BankTransaction.aggregate([
      { $match: { tenantId, status: { $in: ['unmatched', 'mismatch'] } } },
      { $group: { _id: null, total: { $sum: '$amountMinor' } } },
    ]),
  ]);

  const latest = await models.BankTransaction.findOne({ tenantId }).sort({ createdAt: -1 }).lean();

  return {
    totalBankTransactions: total,
    matchedCount: matched,
    unmatchedCount: unmatched,
    mismatchCount: mismatch,
    manuallyMatchedCount: manuallyMatched,
    ignoredCount: ignored,
    totalReconciledMinor: reconciledAgg[0]?.total ?? 0,
    totalUnreconciledMinor: unreconciledAgg[0]?.total ?? 0,
    latestBatchId: latest?.batchId,
  };
}

export interface BankRowQuery {
  status?: string;
  batchId?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

export async function listBankRows(
  models: BillingModels,
  tenantId: string,
  query: BankRowQuery,
): Promise<{ items: unknown[]; total: number; page: number; perPage: number; totalPages: number }> {
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.perPage) || 20));
  const filter: Record<string, unknown> = { tenantId };
  if (query.status) filter.status = query.status;
  if (query.batchId) filter.batchId = query.batchId;
  if (query.search) {
    const term = query.search.trim();
    const re = { $regex: term, $options: 'i' as const };
    filter.$or = [{ externalReference: re }, { description: re }];
  }
  const [items, total] = await Promise.all([
    models.BankTransaction.find(filter)
      .sort({ transactionDate: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage),
    models.BankTransaction.countDocuments(filter),
  ]);
  return { items: items.map((t) => t.toJSON()), total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

async function loadRow(models: BillingModels, tenantId: string, bankTransactionId: string) {
  const row = await models.BankTransaction.findOne({ tenantId, bankTransactionId });
  if (!row) throw ApiError.notFound('Bank transaction not found', 'BANK_TRANSACTION_NOT_FOUND');
  return row;
}

/** Manually match a bank row to a ledger transaction (audit-logged). */
export async function manuallyMatch(
  models: BillingModels,
  tenantId: string,
  actor: { id: string; email: string },
  bankTransactionId: string,
  ledgerTransactionId: string,
  note?: string,
  meta: { ip?: string; userAgent?: string } = {},
) {
  const row = await loadRow(models, tenantId, bankTransactionId);
  const ledger = await models.LedgerTransaction.findOne({ tenantId, transactionId: ledgerTransactionId });
  if (!ledger) throw ApiError.notFound('Ledger transaction not found', 'LEDGER_TRANSACTION_NOT_FOUND');

  row.ledgerTransactionId = ledgerTransactionId;
  row.status = 'manually_matched';
  row.matchConfidence = 'manual';
  if (note) row.notes = note.trim();
  await row.save();

  emitTenantEvent(tenantId, SOCKET_EVENTS.reconciliationMatched, {
    bankTransactionId: row.bankTransactionId,
    ledgerTransactionId,
  });

  await writeAudit({
    tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.ManualMatchCreated,
    resource: 'reconciliation',
    resourceId: row.bankTransactionId,
    details: { ledgerTransactionId, note: note?.trim() },
    ip: meta.ip,
    userAgent: meta.userAgent,
  }).catch((auditErr) => logger.warn('audit ManualMatchCreated failed', { auditErr }));

  return row.toJSON();
}

/** Unmatch a bank row -> returns it to `unmatched`. */
export async function unmatch(
  models: BillingModels,
  tenantId: string,
  actor: { id: string; email: string },
  bankTransactionId: string,
  meta: { ip?: string; userAgent?: string } = {},
) {
  const row = await loadRow(models, tenantId, bankTransactionId);
  if (row.status === 'ignored') {
    throw ApiError.badRequest('Ignored rows cannot be unmatched; un-ignore first', 'ROW_IGNORED');
  }
  row.ledgerTransactionId = undefined;
  row.status = 'unmatched';
  row.matchConfidence = undefined;
  await row.save();

  await writeAudit({
    tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.ManualMatchRemoved,
    resource: 'reconciliation',
    resourceId: row.bankTransactionId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  }).catch((auditErr) => logger.warn('audit ManualMatchRemoved failed', { auditErr }));

  return row.toJSON();
}

/** Add/update a manual note on a bank row. */
export async function setNotes(
  models: BillingModels,
  tenantId: string,
  bankTransactionId: string,
  note: string,
) {
  const row = await loadRow(models, tenantId, bankTransactionId);
  row.notes = note.trim();
  await row.save();
  return row.toJSON();
}

/** Mark a bank row as ignored (or un-ignore by passing ignore=false). */
export async function setIgnored(
  models: BillingModels,
  tenantId: string,
  actor: { id: string; email: string },
  bankTransactionId: string,
  ignore: boolean,
  meta: { ip?: string; userAgent?: string } = {},
) {
  const row = await loadRow(models, tenantId, bankTransactionId);
  if (ignore) {
    row.status = 'ignored';
    row.ledgerTransactionId = undefined;
    row.matchConfidence = undefined;
  } else if (row.status === 'ignored') {
    row.status = 'unmatched';
  }
  await row.save();

  await writeAudit({
    tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.BankTransactionIgnored,
    resource: 'reconciliation',
    resourceId: row.bankTransactionId,
    details: { ignored: ignore },
    ip: meta.ip,
    userAgent: meta.userAgent,
  }).catch((auditErr) => logger.warn('audit BankTransactionIgnored failed', { auditErr }));

  return row.toJSON();
}