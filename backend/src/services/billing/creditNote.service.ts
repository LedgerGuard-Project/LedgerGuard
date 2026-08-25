import type { Connection } from 'mongoose';
import { SOCKET_EVENTS, AuditAction, type LedgerPostingGroup } from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import type { CreditNoteDocument } from '../../models/billing/CreditNote';
import { ApiError } from '../../utils/ApiError';
import { amountToMinor, fromMinor, roundMoney } from '../../utils/money';
import { newCreditNoteId, newTransactionId } from '../../utils/ids';
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

export interface CreateCreditNoteInput {
  invoiceId: string;
  reason?: string;
  /** Major-unit amount being credited (excludes tax). */
  amount: number;
  /** Optional tax percentage applied to the credit (historical snapshot). */
  taxRate?: number;
  status?: 'draft' | 'issued';
}

export interface IssueResult {
  creditNote: Record<string, unknown>;
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

/** Build the reverse double-entry group for a credit note (reduces receivable). */
function buildCreditNotePosting(
  transactionId: string,
  currency: string,
  customerAccountId: string,
  totalMinor: number,
  description: string,
): LedgerPostingGroup;
function buildCreditNotePosting(
  transactionId: string,
  currency: string,
  customerAccountId: string,
  totalMinor: number,
  description: string,
) {
  return {
    transactionId,
    currency,
    entries: [
      {
        accountId: customerAccountId,
        entryType: 'revenue_account',
        amountMinor: totalMinor,
        direction: 'debit',
        description: `${description} (revenue reversal)`,
      },
      {
        accountId: customerAccountId,
        entryType: 'customer_account',
        amountMinor: totalMinor,
        direction: 'credit',
        description: `${description} (customer credit)`,
      },
    ],
  };
}

export async function createCreditNote(
  models: BillingModels,
  tenantId: string,
  input: CreateCreditNoteInput,
): Promise<CreditNoteDocument> {
  const invoice = await models.Invoice.findOne({ tenantId, invoiceId: input.invoiceId });
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  if (invoice.status === 'cancelled') {
    throw ApiError.badRequest('A cancelled invoice cannot be credited', 'INVOICE_CANCELLED');
  }
  const amountMinor = amountToMinor(input.amount);
  const currency = invoice.currency.toUpperCase();
  const taxRate = input.taxRate ?? 0;
  if (taxRate < 0 || taxRate > 100) {
    throw ApiError.badRequest('Tax rate must be between 0 and 100', 'INVALID_TAX_RATE');
  }
  const taxAmountMinor = Math.round(amountMinor * (taxRate / 100));
  const totalMinor = amountMinor + taxAmountMinor;

  const creditNoteNumber = await nextSequenceNumber(models, tenantId, 'credit_note', 'CRT');
  const customer = await getCustomerByKey(models, tenantId, invoice.customerId);
  const note = await models.CreditNote.create({
    creditNoteId: newCreditNoteId(),
    tenantId,
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    customerName: customer.name,
    creditNoteNumber,
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

export async function cancelCreditNote(
  models: BillingModels,
  tenantId: string,
  creditNoteId: string,
): Promise<CreditNoteDocument> {
  const note = await loadCreditNote(models, tenantId, creditNoteId);
  if (note.status === 'cancelled') return note;
  if (note.status !== 'draft') {
    throw ApiError.badRequest('Only draft credit notes can be cancelled', 'CREDIT_NOTE_CANNOT_CANCEL');
  }
  note.status = 'cancelled';
  await note.save();
  return note;
}

export async function listCreditNotes(
  models: BillingModels,
  tenantId: string,
): Promise<CreditNoteDocument[]> {
  return models.CreditNote.find({ tenantId }).sort({ createdAt: -1 }).limit(200);
}

async function loadCreditNote(
  models: BillingModels,
  tenantId: string,
  creditNoteId: string,
): Promise<CreditNoteDocument> {
  const note = await models.CreditNote.findOne({ tenantId, creditNoteId });
  if (!note) throw ApiError.notFound('Credit note not found', 'CREDIT_NOTE_NOT_FOUND');
  return note;
}
export async function issueCreditNote(
  connection: Connection,
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  creditNoteId: string,
  options: { idempotencyKey: string },
  meta: { ip?: string; userAgent?: string } = {},
): Promise<IssueResult> {
  const requestHash = hashRequest({ creditNoteId });
  try {
    const { result, degraded } = await distributedLockService.withLock(
      tenantId,
      options.idempotencyKey,
      () =>
        runIssuedCredit(
          connection,
          models,
          tenantId,
          actor,
          creditNoteId,
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
        ? ApiError.conflict('This credit note is already being processed', 'LOCK_CONTENTION')
        : new ApiError(
            'Distributed locking is unavailable (Redis is down) and the failure policy is fail_closed',
            503,
            'LOCK_UNAVAILABLE',
          );
    }
    throw err;
  }
}

async function runIssuedCredit(
  connection: Connection,
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  creditNoteId: string,
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
    throw ApiError.conflict('Credit note issue already in progress', 'IN_PROGRESS');
  }
  if (!(await transactionsSupported(connection))) {
    throw new ApiError(
      'ACID transactions are unavailable: MongoDB must run as a single-node replica set. No financial writes were performed.',
      503,
      'TRANSACTIONS_UNSUPPORTED',
    );
  }
  const note = await loadCreditNote(models, tenantId, creditNoteId);
  if (note.status !== 'draft') {
    throw ApiError.badRequest('Only draft credit notes can be issued', 'CREDIT_NOTE_NOT_DRAFT');
  }
  const customer = await getCustomerByKey(models, tenantId, note.customerId);
  const account = await getAccountByCustomer(models, tenantId, customer.customerId);
  if (!account) throw ApiError.notFound('Billing account not found', 'ACCOUNT_NOT_FOUND');
  if (account.status !== 'active') {
    throw ApiError.badRequest('Billing account is not active', 'ACCOUNT_FROZEN');
  }
  await assertPeriodOpenFor(models, tenantId, new Date(), 'Credit note');

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
            type: 'credit',
            status: 'completed',
            idempotencyKey: options.idempotencyKey,
            reference: note.creditNoteNumber,
            description: `Credit note ${note.creditNoteNumber}: ${note.reason ?? 'credit'} (${note.currency} ${roundMoney(fromMinor(note.totalMinor))})`,
            completedAt: new Date(),
          },
        ],
        { session },
      );
      await postLedgerGroup(session, models, tenantId, {
        transactionId,
        currency: note.currency,
        entries: buildCreditNotePosting(
          transactionId,
          note.currency,
          account.accountId,
          note.totalMinor,
          `Credit note ${note.creditNoteNumber}`,
        ).entries,
      });
      await models.BillingAccount.updateOne(
        { tenantId, accountId: account.accountId },
        { $inc: { balanceMinor: -note.totalMinor } },
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
      loadCreditNote(models, tenantId, creditNoteId),
      note.invoiceId ? models.Invoice.findOne({ tenantId, invoiceId: note.invoiceId }) : null,
    ]);
    const result: IssueResult = {
      idempotencyKey: options.idempotencyKey,
      idempotencyStatus: 'completed',
      creditNote: noteAfter.toJSON() as Record<string, unknown>,
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
    emitTenantEvent(tenantId, SOCKET_EVENTS.creditNoteCreated, { creditNoteId: note.creditNoteId });
    await createNotification(models, tenantId, {
      type: 'credit_note',
      title: 'Credit note issued',
      message: `${note.currency} ${roundMoney(fromMinor(note.totalMinor))} credited against ${note.invoiceNumber ?? note.invoiceId}`,
      data: { creditNoteId: note.creditNoteId, totalMinor: note.totalMinor },
    });
    await writeAudit({
      tenantId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: AuditAction.CreditNoteIssued,
      resource: 'credit_note',
      resourceId: note.creditNoteId,
      details: { transactionId, amountMinor: note.amountMinor, taxAmountMinor: note.taxAmountMinor, totalMinor: note.totalMinor },
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).catch((auditErr) => logger.warn('audit CreditNoteIssued failed', { auditErr }));
    return result;
  } catch (err) {
    await session.abortTransaction().catch(() => undefined);
    await failIdempotency(idem.record).catch(() => undefined);
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      'Credit note issuance failed; all financial writes were rolled back',
      500,
      'CREDIT_NOTE_FAILED',
      { original: err instanceof Error ? err.message : String(err) },
    );
  } finally {
    await session.endSession().catch(() => undefined);
  }
}
// __CHUNK4__