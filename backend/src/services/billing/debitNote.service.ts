import type { Connection } from 'mongoose';
import { SOCKET_EVENTS, AuditAction, type LedgerPostingGroup } from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import type { DebitNoteDocument } from '../../models/billing/DebitNote';
import { ApiError } from '../../utils/ApiError';
import { amountToMinor, fromMinor, roundMoney } from '../../utils/money';
import { newDebitNoteId, newTransactionId } from '../../utils/ids';
import { distributedLockService, LockError } from '../DistributedLockService';
import { beginIdempotency, completeIdempotency, failIdempotency, hashRequest } from '../idempotency.service';
import { transactionsSupported } from './payment.service';
import { getCustomerByKey } from './customer.service';
import { getAccountByCustomer } from './account.service';
import { postLedgerGroup } from './ledger.service';
import { nextSequenceNumber } from './sequence';
import { createNotification } from './notification.service';
import { writeAudit } from '../audit.service';
import { emitTenantEvent } from '../../sockets/eventBus';
import { assertPeriodOpenFor } from './financialPeriod.service';
import { logger } from '../../utils/logger';

export interface CreateDebitNoteInput {
  invoiceId: string;
  reason?: string;
  /** Major-unit additional charge (excludes tax). */
  amount: number;
  /** Optional tax percentage applied to the debit (historical snapshot). */
  taxRate?: number;
  status?: 'draft' | 'issued';
}

export interface IssueResult {
  debitNote: Record<string, unknown>;
  transaction: Record<string, unknown>;
  ledgerEntries: Record<string, unknown>[];
  account: Record<string, unknown>;
  invoice: Record<string, unknown> | null;
  idempotencyKey: string;
  idempotencyStatus: 'completed';
  replay?: boolean;
  degraded?: boolean;
}

type Actor = { id: string; email?: string };

/** Build the double-entry group for a debit note (increases receivable). */
function buildDebitNotePosting(
  transactionId: string,
  currency: string,
  customerAccountId: string,
  totalMinor: number,
  description: string,
): LedgerPostingGroup {
  return {
    transactionId,
    currency,
    entries: [
      {
        accountId: customerAccountId,
        entryType: 'customer_account',
        amountMinor: totalMinor,
        direction: 'debit',
        description: `${description} (customer receivable)`,
      },
      {
        accountId: customerAccountId,
        entryType: 'revenue_account',
        amountMinor: totalMinor,
        direction: 'credit',
        description: `${description} (revenue recognized)`,
      },
    ],
  };
}

export async function createDebitNote(
  models: BillingModels,
  tenantId: string,
  input: CreateDebitNoteInput,
): Promise<DebitNoteDocument> {
  const invoice = await models.Invoice.findOne({ tenantId, invoiceId: input.invoiceId });
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  if (invoice.status === 'cancelled') {
    throw ApiError.badRequest('A cancelled invoice cannot be debited', 'INVOICE_CANCELLED');
  }
  const amountMinor = amountToMinor(input.amount);
  const currency = invoice.currency.toUpperCase();
  const taxRate = input.taxRate ?? 0;
  if (taxRate < 0 || taxRate > 100) {
    throw ApiError.badRequest('Tax rate must be between 0 and 100', 'INVALID_TAX_RATE');
  }
  const taxAmountMinor = Math.round(amountMinor * (taxRate / 100));
  const totalMinor = amountMinor + taxAmountMinor;

  const debitNoteNumber = await nextSequenceNumber(models, tenantId, 'debit_note', 'DBT');
  const customer = await getCustomerByKey(models, tenantId, invoice.customerId);
  const note = await models.DebitNote.create({
    debitNoteId: newDebitNoteId(),
    tenantId,
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    customerName: customer.name,
    debitNoteNumber,
    status: 'draft',
    reason: input.reason?.trim(),
    currency,
    amountMinor,
    taxRateMinor: taxRate || undefined,
    taxAmountMinor: taxAmountMinor || undefined,
    totalMinor,
  });
  await note.save();
  return note;
}

async function loadDebitNote(
  models: BillingModels,
  tenantId: string,
  debitNoteId: string,
): Promise<DebitNoteDocument> {
  const note = await models.DebitNote.findOne({ tenantId, debitNoteId });
  if (!note) throw ApiError.notFound('Debit note not found', 'DEBIT_NOTE_NOT_FOUND');
  return note;
}
export async function issueDebitNote(
  connection: Connection,
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  debitNoteId: string,
  options: { idempotencyKey: string },
  meta: { ip?: string; userAgent?: string } = {},
): Promise<IssueResult> {
  const requestHash = hashRequest({ debitNoteId });
  try {
    const { result, degraded } = await distributedLockService.withLock(
      tenantId,
      options.idempotencyKey,
      () =>
        runIssuedDebit(
          connection,
          models,
          tenantId,
          actor,
          debitNoteId,
          options,
          requestHash,
          meta,
        ),
    );
    if (degraded) result.degraded = true;
    return result;
  } catch (err) {
    if (err instanceof LockError) {
      throw err.reason === 'contention'
        ? ApiError.conflict('This debit note is already being processed', 'LOCK_CONTENTION')
        : new ApiError(
            'Distributed locking is unavailable (Redis is down) and the failure policy is fail_closed',
            503,
            'LOCK_UNAVAILABLE',
          );
    }
    throw err;
  }
}

async function runIssuedDebit(
  connection: Connection,
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  debitNoteId: string,
  options: { idempotencyKey: string },
  requestHash: string,
  meta: { ip?: string; userAgent?: string },
): Promise<IssueResult> {
  const idem = await beginIdempotency(models, tenantId, options.idempotencyKey, requestHash);
  if (idem.kind === 'replay') {
    const snapshot = (idem.response ?? {}) as Record<string, unknown>;
    return {
      ...snapshot,
      idempotencyKey: options.idempotencyKey,
      idempotencyStatus: 'completed',
      replay: true,
    } as unknown as IssueResult;
  }
  if (idem.kind === 'in_progress') {
    throw ApiError.conflict('Debit note issue already in progress', 'IN_PROGRESS');
  }
  if (!(await transactionsSupported(connection))) {
    throw new ApiError(
      'ACID transactions are unavailable: MongoDB must run as a single-node replica set. No financial writes were performed.',
      503,
      'TRANSACTIONS_UNSUPPORTED',
    );
  }
  const note = await loadDebitNote(models, tenantId, debitNoteId);
  if (note.status !== 'draft') {
    throw ApiError.badRequest('Only draft debit notes can be issued', 'DEBIT_NOTE_NOT_DRAFT');
  }
  const customer = await getCustomerByKey(models, tenantId, note.customerId);
  const account = await getAccountByCustomer(models, tenantId, customer.customerId);
  if (!account) throw ApiError.notFound('Billing account not found', 'ACCOUNT_NOT_FOUND');
  if (account.status !== 'active') {
    throw ApiError.badRequest('Billing account is not active', 'ACCOUNT_FROZEN');
  }
  await assertPeriodOpenFor(models, tenantId, new Date(), 'Debit note');

  const transactionId = newTransactionId();
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      await models.LedgerTransaction.create(
        [
          {
            transactionId,
            tenantId,
            customerId: customer.customerId,
            accountId: account.accountId,
            invoiceId: note.invoiceId,
            amountMinor: note.totalMinor,
            currency: note.currency,
            type: 'debit',
            status: 'completed',
            idempotencyKey: options.idempotencyKey,
            reference: note.debitNoteNumber,
            description: `Debit note ${note.debitNoteNumber}: ${note.reason ?? 'debit'} (${note.currency} ${roundMoney(fromMinor(note.totalMinor))})`,
            completedAt: new Date(),
          },
        ],
        { session },
      );
      await postLedgerGroup(session, models, tenantId, {
        transactionId,
        currency: note.currency,
        entries: buildDebitNotePosting(
          transactionId,
          note.currency,
          account.accountId,
          note.totalMinor,
          `Debit note ${note.debitNoteNumber}`,
        ).entries,
      });
      await models.BillingAccount.updateOne(
        { tenantId, accountId: account.accountId },
        { $inc: { balanceMinor: note.totalMinor } },
        { session },
      );
      note.status = 'issued';
      note.issuedAt = new Date();
      await note.save({ session });
    });

    const [txn, entries, accountAfter, noteAfter, invoiceAfter] = await Promise.all([
      models.LedgerTransaction.findOne({ tenantId, transactionId }),
      models.LedgerEntry.find({ tenantId, transactionId }),
      getAccountByCustomer(models, tenantId, customer.customerId),
      loadDebitNote(models, tenantId, debitNoteId),
      note.invoiceId ? models.Invoice.findOne({ tenantId, invoiceId: note.invoiceId }) : null,
    ]);
    const result: IssueResult = {
      idempotencyKey: options.idempotencyKey,
      idempotencyStatus: 'completed',
      debitNote: noteAfter.toJSON() as Record<string, unknown>,
      transaction: txn ? (txn.toJSON() as Record<string, unknown>) : {},
      ledgerEntries: entries.map((e) => e.toJSON() as Record<string, unknown>),
      account: accountAfter
        ? { ...accountAfter.toJSON(), balance: roundMoney(fromMinor(accountAfter.balanceMinor)) }
        : {},
      invoice: invoiceAfter
        ? { ...invoiceAfter.toJSON(), total: roundMoney(fromMinor(invoiceAfter.totalMinor)) }
        : null,
    };
    await completeIdempotency(idem.record, result, transactionId);
    emitTenantEvent(tenantId, SOCKET_EVENTS.ledgerUpdated, { transactionId, tenantId });
    emitTenantEvent(tenantId, SOCKET_EVENTS.debitNoteCreated, { debitNoteId: note.debitNoteId });
    await createNotification(models, tenantId, {
      type: 'debit_note',
      title: 'Debit note issued',
      message: `${note.currency} ${roundMoney(fromMinor(note.totalMinor))} added against ${note.invoiceNumber ?? note.invoiceId}`,
      data: { debitNoteId: note.debitNoteId, totalMinor: note.totalMinor },
    });
    await writeAudit({
      tenantId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: AuditAction.DebitNoteIssued,
      resource: 'debit_note',
      resourceId: note.debitNoteId,
      details: { transactionId, amountMinor: note.amountMinor, taxAmountMinor: note.taxAmountMinor, totalMinor: note.totalMinor },
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).catch((auditErr) => logger.warn('audit DebitNoteIssued failed', { auditErr }));
    return result;
  } catch (err) {
    await session.abortTransaction().catch(() => undefined);
    await failIdempotency(idem.record).catch(() => undefined);
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      'Debit note issuance failed; all financial writes were rolled back',
      500,
      'DEBIT_NOTE_FAILED',
      { original: err instanceof Error ? err.message : String(err) },
    );
  } finally {
    await session.endSession().catch(() => undefined);
  }
}
export async function cancelDebitNote(
  models: BillingModels,
  tenantId: string,
  debitNoteId: string,
): Promise<DebitNoteDocument> {
  const note = await loadDebitNote(models, tenantId, debitNoteId);
  if (note.status === 'cancelled') return note;
  if (note.status !== 'draft') {
    throw ApiError.badRequest('Only draft debit notes can be cancelled', 'DEBIT_NOTE_CANNOT_CANCEL');
  }
  note.status = 'cancelled';
  await note.save();
  return note;
}

export async function listDebitNotes(
  models: BillingModels,
  tenantId: string,
): Promise<DebitNoteDocument[]> {
  return models.DebitNote.find({ tenantId }).sort({ createdAt: -1 }).limit(200);
}