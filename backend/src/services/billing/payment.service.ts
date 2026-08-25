import type { Connection } from 'mongoose';
import {
  SUPPORTED_CURRENCIES,
  SOCKET_EVENTS,
  type LedgerPostingGroup,
  type PaymentMethod,
} from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import { ApiError } from '../../utils/ApiError';
import { amountToMinor, fromMinor, roundMoney } from '../../utils/money';
import {
  newReference,
  newTransactionId,
} from '../../utils/ids';
import { distributedLockService, LockError } from '../DistributedLockService';
import {
  beginIdempotency,
  completeIdempotency,
  failIdempotency,
  hashRequest,
} from '../idempotency.service';
import { assertPeriodOpenFor } from './financialPeriod.service';
import { getCustomerByKey, ensureAccountForCustomer } from './customer.service';
import { getAccountByCustomer } from './account.service';
import { postLedgerGroup } from './ledger.service';
import { serializeAccount, serializeInvoice, serializeTransaction } from './serializers';
import { createNotification } from './notification.service';
import { writeAudit } from '../audit.service';
import { emitTenantEvent } from '../../sockets/eventBus';
import { AuditAction } from '@ledgerguard/shared';
import { logger } from '../../utils/logger';

export interface ProcessPaymentInput {
  amount: number;
  currency: string;
  customerId: string;
  invoiceId?: string;
  reference?: string;
  description?: string;
  paymentMethod?: PaymentMethod;
  idempotencyKey: string;
}

export interface PaymentResult {
  status: 'completed' | 'processing' | 'replay';
  transaction?: Record<string, unknown>;
  ledgerEntries?: Record<string, unknown>[];
  account?: Record<string, unknown>;
  invoice?: Record<string, unknown> | null;
  idempotencyKey: string;
  idempotencyStatus: 'completed' | 'processing';
  replay?: boolean;
  degraded?: boolean;
}

/** Cached per-connection knowledge of whether the MongoDB deployment supports multi-doc transactions. */
const transactionSupportCache = new WeakMap<object, boolean>();

/** True when the connected MongoDB deployment is a replica set / sharded cluster. */
export async function transactionsSupported(connection: Connection): Promise<boolean> {
  const cached = transactionSupportCache.get(connection);
  if (cached !== undefined) return cached;
  if (!connection.db) return false;
  try {
    const hello = await connection.db.admin().command({ hello: 1 });
    const supported = Boolean((hello as { setName?: string }).setName);
    transactionSupportCache.set(connection, supported);
    return supported;
  } catch {
    transactionSupportCache.set(connection, false);
    return false;
  }
}

function isTransactionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /replica set|Transaction numbers|transaction/i.test(message);
}

/** Sum of completed charges minus refunds applied to an invoice, in minor units. */
async function paidSoFarMinor(
  models: BillingModels,
  tenantId: string,
  invoiceId: string,
  session?: import('mongoose').ClientSession,
): Promise<number> {
  const charges = await models.LedgerTransaction.find(
    { tenantId, invoiceId, type: 'charge', status: 'completed' },
    { amountMinor: 1 },
    { session },
  );
  const refunds = await models.LedgerTransaction.find(
    { tenantId, invoiceId, type: 'refund', status: 'completed' },
    { amountMinor: 1 },
    { session },
  );
  return (
    charges.reduce((acc, t) => acc + t.amountMinor, 0) -
    refunds.reduce((acc, t) => acc + t.amountMinor, 0)
  );
}

/** Build the double-entry group for a customer charge ($X). Exported for safe retry reuse. */
export function buildChargePosting(
  transactionId: string,
  currency: string,
  customerAccountId: string,
  amountMinor: number,
  description: string,
): LedgerPostingGroup {
  return {
    transactionId,
    currency,
    entries: [
      {
        accountId: customerAccountId,
        entryType: 'customer_account',
        amountMinor,
        direction: 'debit',
        description: `${description} (customer receivable)`,
      },
      {
        accountId: customerAccountId,
        entryType: 'revenue_account',
        amountMinor,
        direction: 'credit',
        description: `${description} (revenue recognized)`,
      },
    ],
  };
}

/** Build the reverse double-entry group for a refund. */
function buildRefundPosting(
  transactionId: string,
  currency: string,
  customerAccountId: string,
  amountMinor: number,
  description: string,
): LedgerPostingGroup {
  return {
    transactionId,
    currency,
    entries: [
      {
        accountId: customerAccountId,
        entryType: 'revenue_account',
        amountMinor,
        direction: 'debit',
        description: `${description} (revenue reversal)`,
      },
      {
        accountId: customerAccountId,
        entryType: 'customer_account',
        amountMinor,
        direction: 'credit',
        description: `${description} (customer credit)`,
      },
    ],
  };
}

/** Load the tenant context + validate the payment before any writes happen. */
async function preparePaymentContext(
  models: BillingModels,
  tenantId: string,
  input: ProcessPaymentInput,
): Promise<{ amountMinor: number; currency: string; customer: import('../../models/billing/Customer').CustomerDocument }> {
  const amountMinor = amountToMinor(input.amount);
  const currency = input.currency.toUpperCase();
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    throw ApiError.badRequest(`Unsupported currency: ${currency}`, 'UNSUPPORTED_CURRENCY');
  }
  const customer = await getCustomerByKey(models, tenantId, input.customerId);
  if (customer.status !== 'active') {
    throw ApiError.badRequest('Customer is not active and cannot be charged', 'CUSTOMER_INACTIVE');
  }
  return { amountMinor, currency, customer };
}

type Actor = { id: string; email?: string };

/**
 * Process a customer payment with full Phase 2 guarantees:
 * distributed lock -> tenant-scoped idempotency -> MongoDB ACID transaction
 * (transaction + balanced double-entry ledger + account + invoice + notification)
 * -> commit / rollback -> audit + real-time events.
 */
export async function processPayment(
  connection: Connection,
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  input: ProcessPaymentInput,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<PaymentResult> {
  const ctx = await preparePaymentContext(models, tenantId, input);
  const requestHash = hashRequest({
    amount: input.amount,
    currency: ctx.currency,
    customerId: input.customerId,
    invoiceId: input.invoiceId,
    reference: input.reference,
  });

  try {
    const { result, degraded } = await distributedLockService.withLock(
      tenantId,
      input.idempotencyKey,
      () => runGuardedCharge(connection, models, tenantId, actor, ctx, input, requestHash, meta),
    );
    if (degraded) result.degraded = true;
    return result;
  } catch (err) {
    if (err instanceof LockError) {
      if (err.reason === 'contention') {
        throw ApiError.conflict(
          'This payment is already being processed by another request',
          'LOCK_CONTENTION',
        );
      }
      throw new ApiError(
        'Distributed locking is unavailable (Redis is down) and the failure policy is fail_closed',
        503,
        'LOCK_UNAVAILABLE',
      );
    }
    throw err;
  }
}

async function runGuardedCharge(
  connection: Connection,
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  ctx: PaymentContext,
  input: ProcessPaymentInput,
  requestHash: string,
  meta: { ip?: string; userAgent?: string },
): Promise<PaymentResult> {
  const idem = await beginIdempotency(models, tenantId, input.idempotencyKey, requestHash);
  if (idem.kind === 'replay') {
    const snapshot = (idem.response ?? {}) as Record<string, unknown>;
    return {
      status: snapshot.status === 'processing' ? 'processing' : 'replay',
      idempotencyKey: input.idempotencyKey,
      idempotencyStatus: 'completed',
      replay: true,
      ...snapshot,
    };
  }
  if (idem.kind === 'in_progress') {
    return {
      status: 'processing',
      idempotencyKey: input.idempotencyKey,
      idempotencyStatus: 'processing',
    };
  }
  return runChargeTransaction(
    connection,
    models,
    tenantId,
    actor,
    ctx,
    input,
    idem.record,
    meta,
  );
}

interface PaymentContext {
  amountMinor: number;
  currency: string;
  customer: import('../../models/billing/Customer').CustomerDocument;
}

async function runChargeTransaction(
  connection: Connection,
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  ctx: PaymentContext,
  input: ProcessPaymentInput,
  record: import('../../models/billing/IdempotencyRecord').IdempotencyRecordDocument,
  meta: { ip?: string; userAgent?: string },
): Promise<PaymentResult> {
  if (!(await transactionsSupported(connection))) {
    throw new ApiError(
      'ACID transactions are unavailable: MongoDB must run as a single-node replica set (mongod --replSet rs0). No financial writes were performed.',
      503,
      'TRANSACTIONS_UNSUPPORTED',
    );
  }

  const customer = ctx.customer;
  const account =
    (await getAccountByCustomer(models, tenantId, customer.customerId)) ??
    (await ensureAccountForCustomer(models, tenantId, customer, ctx.currency));

  if (account.status !== 'active') {
    throw ApiError.badRequest('Billing account is not active', 'ACCOUNT_FROZEN');
  }
  if (account.currency !== ctx.currency && account.balanceMinor !== 0) {
    throw ApiError.badRequest(
      `Account currency is ${account.currency}; payments must match the account currency (balance non-zero)`,
      'ACCOUNT_CURRENCY_MISMATCH',
    );
  }

  // Financial periods: reject payments posted inside a closed period (server-side).
  await assertPeriodOpenFor(models, tenantId, new Date(), 'Payment');

  const transactionId = newTransactionId();
  const reference = input.reference?.trim() || newReference();
  const description =
    input.description?.trim() || `Payment ${reference} from ${customer.name}`;
  const paymentMethod = input.paymentMethod ?? 'card';

  emitTenantEvent(tenantId, SOCKET_EVENTS.paymentProcessing, {
    transactionId,
    customerId: customer.customerId,
    amountMinor: ctx.amountMinor,
    currency: ctx.currency,
    idempotencyKey: input.idempotencyKey,
  });
  await writeAudit({
    tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.PaymentCreated,
    resource: 'payment',
    resourceId: transactionId,
    details: { amountMinor: ctx.amountMinor, currency: ctx.currency, idempotencyKey: input.idempotencyKey },
    ip: meta.ip,
    userAgent: meta.userAgent,
  }).catch((err) => logger.warn('audit PaymentCreated failed', { err }));

  const session = await connection.startSession();
  let invoiceDb: import('../../models/billing/Invoice').InvoiceDocument | null = null;

  try {
    await session.withTransaction(async () => {
      // Existing paid amount is read FIRST (before the charge is inserted in
      // this session) so the current payment is never double-counted.
      const priorPaidMinor = input.invoiceId
        ? await paidSoFarMinor(models, tenantId, input.invoiceId, session)
        : 0;

      await models.LedgerTransaction.create(
        [
          {
            transactionId,
            tenantId,
            customerId: customer.customerId,
            accountId: account.accountId,
            invoiceId: input.invoiceId,
            amountMinor: ctx.amountMinor,
            currency: ctx.currency,
            type: 'charge',
            status: 'completed',
            idempotencyKey: input.idempotencyKey,
            reference,
            description,
            paymentMethod,
            completedAt: new Date(),
          },
        ],
        { session },
      );

      await postLedgerGroup(session, models, tenantId, {
        transactionId,
        currency: ctx.currency,
        entries: buildChargePosting(
          transactionId,
          ctx.currency,
          account.accountId,
          ctx.amountMinor,
          description,
        ).entries,
      });

      await models.BillingAccount.updateOne(
        { tenantId, accountId: account.accountId },
        { $inc: { balanceMinor: ctx.amountMinor } },
        { session },
      );

      if (input.invoiceId) {
        const invoice = await models.Invoice.findOne(
          { tenantId, invoiceId: input.invoiceId },
          null,
          { session },
        );
        if (!invoice) {
          throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
        }
        if (invoice.status === 'cancelled') {
          throw ApiError.badRequest('A cancelled invoice cannot be paid', 'INVOICE_CANCELLED');
        }
        // Overpayment guard runs regardless of current status (a paid invoice
        // must also reject further charges).
        const after = priorPaidMinor + ctx.amountMinor;
        if (after > invoice.totalMinor) {
          throw ApiError.badRequest(
            `Payment of ${fromMinor(ctx.amountMinor)} ${ctx.currency} exceeds the outstanding balance of this invoice (${fromMinor(Math.max(0, invoice.totalMinor - priorPaidMinor))} ${ctx.currency} remaining); overpayments are not permitted`,
            'OVERPAYMENT_EXCEEDS',
          );
        }
        if (invoice.status !== 'paid') {
          if (after >= invoice.totalMinor) {
            invoice.status = 'paid';
            invoice.paidAt = new Date();
          } else if (after > 0) {
            invoice.status = 'partially_paid';
            invoice.paidAt = invoice.paidAt ?? new Date();
          }
          await invoice.save({ session });
          invoiceDb = invoice;
        }
      }

      await createNotification(models, tenantId, {
        type: 'payment',
        title: 'Payment completed',
        message: `${ctx.currency} ${roundMoney(fromMinor(ctx.amountMinor))} received from ${customer.name}`,
        data: { transactionId, amountMinor: ctx.amountMinor },
      });
      // CHUNK3B_MARKER
    });
    const [txn, entries, accountAfter] = await Promise.all([
      models.LedgerTransaction.findOne({ tenantId, transactionId }),
      models.LedgerEntry.find({ tenantId, transactionId }),
      getAccountByCustomer(models, tenantId, customer.customerId),
    ]);
    const ledgerEntries = entries.map((e) => e.toJSON() as Record<string, unknown>);
    const invoiceAfter = input.invoiceId
      ? await getInvoiceFor(models, tenantId, input.invoiceId, invoiceDb)
      : null;

    const result: PaymentResult = {
      status: 'completed',
      idempotencyKey: input.idempotencyKey,
      idempotencyStatus: 'completed',
      transaction: txn ? serializeTransaction(txn) : undefined,
      ledgerEntries,
      account: accountAfter ? serializeAccount(accountAfter) : undefined,
      invoice: invoiceAfter ? serializeInvoice(invoiceAfter) : null,
    };
    await completeIdempotency(record, result, transactionId);

    emitTenantEvent(tenantId, SOCKET_EVENTS.paymentCompleted, {
      transactionId,
      customerId: customer.customerId,
      amountMinor: ctx.amountMinor,
      currency: ctx.currency,
      reference,
    });
    emitTenantEvent(tenantId, SOCKET_EVENTS.ledgerUpdated, {
      transactionId,
      tenantId,
    });
    if (invoiceAfter) {
      emitTenantEvent(tenantId, SOCKET_EVENTS.invoicePaid, {
        invoiceId: invoiceAfter.invoiceId,
        status: invoiceAfter.status,
      });
    }
    await writeAudit({
      tenantId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: AuditAction.PaymentCompleted,
      resource: 'payment',
      resourceId: transactionId,
      details: { amountMinor: ctx.amountMinor, currency: ctx.currency },
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).catch((err) => logger.warn('audit PaymentCompleted failed', { err }));

    return result;
  } catch (err) {
    await session.abortTransaction().catch(() => undefined);
    const rolledBack = isTransactionError(err);
    await models.LedgerTransaction.create({
      transactionId,
      tenantId,
      customerId: customer.customerId,
      accountId: account.accountId,
      invoiceId: input.invoiceId,
      amountMinor: ctx.amountMinor,
      currency: ctx.currency,
      type: 'charge',
      status: rolledBack ? 'rolled_back' : 'failed',
      idempotencyKey: input.idempotencyKey,
      reference,
      description: `${description} (${rolledBack ? 'rolled back' : 'failed'})`,
      paymentMethod,
      failureReason: err instanceof Error ? err.message : String(err),
      retryCount: 0,
    }).catch((writeErr) => logger.warn('failure marker could not be persisted', { writeErr }));

    await failIdempotency(record).catch((idemErr) =>
      logger.warn('idempotency record could not be marked failed', { idemErr }),
    );
    emitTenantEvent(
      tenantId,
      rolledBack ? SOCKET_EVENTS.paymentRolledBack : SOCKET_EVENTS.paymentFailed,
      {
        transactionId,
        customerId: customer.customerId,
        amountMinor: ctx.amountMinor,
        reason: err instanceof Error ? err.message : String(err),
      },
    );
    await writeAudit({
      tenantId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: rolledBack ? AuditAction.PaymentRolledBack : AuditAction.PaymentFailed,
      resource: 'payment',
      resourceId: transactionId,
      details: {
        amountMinor: ctx.amountMinor,
        reason: err instanceof Error ? err.message : String(err),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).catch((auditErr) => logger.warn('audit payment-failure failed', { auditErr }));

    if (err instanceof ApiError) throw err;
    if (isTransactionError(err)) {
      throw new ApiError(
        'The financial database rejected the transaction. All writes were rolled back.',
        503,
        'TRANSACTION_FAILED',
      );
    }
    throw new ApiError(
      'Payment processing failed; all financial writes were rolled back. Please retry with the same Idempotency-Key.',
      500,
      'PAYMENT_PROCESSING_FAILED',
      { original: err instanceof Error ? err.message : String(err) },
    );
  } finally {
    await session.endSession().catch(() => undefined);
  }
}

async function getInvoiceFor(
  models: BillingModels,
  tenantId: string,
  invoiceId: string,
  dbInvoice: import('../../models/billing/Invoice').InvoiceDocument | null,
) {
  const fresh = await models.Invoice.findOne({ tenantId, invoiceId });
  return fresh ?? dbInvoice;
}

export interface RefundInput {
  amount: number;
  reference?: string;
  description?: string;
  paymentMethod?: PaymentMethod;
  idempotencyKey: string;
}

/**
 * Refund a completed charge. Uses the same distributed-lock + idempotency +
 * ACID-transaction pipeline and reverses the ledger + account balance inside a
 * single transaction so the books never go unbalanced.
 */
export async function processRefund(
  connection: Connection,
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  originalTransactionId: string,
  input: RefundInput,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<PaymentResult> {
  const amountMinor = amountToMinor(input.amount);
  const requestHash = hashRequest({ originalTransactionId, amount: input.amount });

  const run = async (): Promise<PaymentResult> => {
    let idemRecord: import('../../models/billing/IdempotencyRecord').IdempotencyRecordDocument | null = null;
    const idem = await beginIdempotency(models, tenantId, input.idempotencyKey, requestHash);
    if (idem.kind === 'replay') {
      const snapshot = (idem.response ?? {}) as Record<string, unknown>;
      return { status: 'replay', idempotencyKey: input.idempotencyKey, idempotencyStatus: 'completed', replay: true, ...snapshot };
    }
    if (idem.kind === 'in_progress') {
      return { status: 'processing', idempotencyKey: input.idempotencyKey, idempotencyStatus: 'processing' };
    }
    idemRecord = idem.record;

    const original = await models.LedgerTransaction.findOne({
      tenantId,
      transactionId: originalTransactionId,
    });
    if (!original) throw ApiError.notFound('Original transaction not found', 'TRANSACTION_NOT_FOUND');
    if (original.type !== 'charge' || original.status !== 'completed') {
      throw ApiError.badRequest('Only completed charge transactions can be refunded', 'REFUND_NOT_ALLOWED');
    }

    const refundedSoFar = await models.LedgerTransaction.aggregate([
      { $match: { tenantId, type: 'refund', status: 'completed', 'metadata.originalTransactionId': originalTransactionId } },
      { $group: { _id: null, total: { $sum: '$amountMinor' } } },
    ]);
    const alreadyRefunded = refundedSoFar[0]?.total ?? 0;
    if (alreadyRefunded + amountMinor > original.amountMinor) {
      throw ApiError.badRequest('Refund exceeds the original charge amount', 'REFUND_EXCEEDS_CHARGE');
    }

    const customer = await getCustomerByKey(models, tenantId, original.customerId);
    const account =
      (await getAccountByCustomer(models, tenantId, customer.customerId)) ??
      (await ensureAccountForCustomer(models, tenantId, customer, original.currency));

    // Financial periods: reject refunds posted inside a closed period (server-side).
    await assertPeriodOpenFor(models, tenantId, new Date(), 'Refund');

    if (!(await transactionsSupported(connection))) {
      throw new ApiError(
        'ACID transactions are unavailable: MongoDB must run as a single-node replica set (mongod --replSet rs0). No financial writes were performed.',
        503,
        'TRANSACTIONS_UNSUPPORTED',
      );
    }

    const transactionId = newTransactionId();
    const reference = input.reference?.trim() || `REF-${original.transactionId.slice(4)}`;
    const description =
      input.description?.trim() || `Refund of ${original.transactionId} to ${customer.name}`;

    emitTenantEvent(tenantId, SOCKET_EVENTS.paymentProcessing, {
      transactionId,
      customerId: customer.customerId,
      amountMinor,
      currency: original.currency,
      idempotencyKey: input.idempotencyKey,
    });

    const session = await connection.startSession();
    const refundState: {
      invoice: import('../../models/billing/Invoice').InvoiceDocument | null;
    } = { invoice: null };
    try {
      await session.withTransaction(async () => {
        await models.LedgerTransaction.create(
          [
            {
              transactionId,
              tenantId,
              customerId: customer.customerId,
              accountId: account.accountId,
              invoiceId: original.invoiceId,
              amountMinor,
              currency: original.currency,
              type: 'refund',
              status: 'completed',
              idempotencyKey: input.idempotencyKey,
              reference,
              description,
              paymentMethod: input.paymentMethod ?? 'manual',
              metadata: { originalTransactionId },
              completedAt: new Date(),
            },
          ],
          { session },
        );

        await postLedgerGroup(session, models, tenantId, {
          transactionId,
          currency: original.currency,
          entries: buildRefundPosting(
            transactionId,
            original.currency,
            account.accountId,
            amountMinor,
            description,
          ).entries,
        });

        await models.BillingAccount.updateOne(
          { tenantId, accountId: account.accountId },
          { $inc: { balanceMinor: -amountMinor } },
          { session },
        );

        if (original.invoiceId) {
          const invoice = await models.Invoice.findOne(
            { tenantId, invoiceId: original.invoiceId },
            null,
            { session },
          );
          if (invoice && invoice.status !== 'cancelled') {
            const remainingPaid = await paidSoFarMinor(models, tenantId, invoice.invoiceId, session);
            if (remainingPaid >= invoice.totalMinor) {
              invoice.status = 'paid';
              invoice.paidAt = invoice.paidAt ?? new Date();
            } else if (remainingPaid > 0) {
              invoice.status = 'partially_paid';
            } else {
              invoice.status = 'issued';
              invoice.paidAt = undefined;
            }
            await invoice.save({ session });
            refundState.invoice = invoice;
          }
        }

        await createNotification(models, tenantId, {
          type: 'payment',
          title: 'Refund completed',
          message: `${original.currency} ${roundMoney(fromMinor(amountMinor))} refunded to ${customer.name}`,
          data: { transactionId, originalTransactionId, amountMinor },
        });
      });

      const [txn, entries, accountAfter] = await Promise.all([
        models.LedgerTransaction.findOne({ tenantId, transactionId }),
        models.LedgerEntry.find({ tenantId, transactionId }),
        getAccountByCustomer(models, tenantId, customer.customerId),
      ]);

      const result: PaymentResult = {
        status: 'completed',
        idempotencyKey: input.idempotencyKey,
        idempotencyStatus: 'completed',
        transaction: txn ? serializeTransaction(txn) : undefined,
        ledgerEntries: entries.map((e) => e.toJSON() as Record<string, unknown>),
        account: accountAfter ? serializeAccount(accountAfter) : undefined,
        invoice: refundState.invoice ? serializeInvoice(refundState.invoice) : null,
      };
      await completeIdempotency(idemRecord, result, transactionId);

      emitTenantEvent(tenantId, SOCKET_EVENTS.paymentCompleted, {
        transactionId,
        customerId: customer.customerId,
        amountMinor,
        currency: original.currency,
        reference,
      });
      emitTenantEvent(tenantId, SOCKET_EVENTS.ledgerUpdated, { transactionId, tenantId });
      if (refundState.invoice) {
        emitTenantEvent(tenantId, SOCKET_EVENTS.invoicePaid, {
          invoiceId: refundState.invoice.invoiceId,
          status: refundState.invoice.status,
        });
      }
      await writeAudit({
        tenantId,
        actorId: actor.id,
        actorEmail: actor.email,
        action: AuditAction.RefundCreated,
        resource: 'payment',
        resourceId: transactionId,
        details: { amountMinor, currency: original.currency, originalTransactionId },
        ip: meta.ip,
        userAgent: meta.userAgent,
      }).catch((auditErr) => logger.warn('audit RefundCreated failed', { auditErr }));
      return result;
    } catch (err) {
      await session.abortTransaction().catch(() => undefined);
      await failIdempotency(idemRecord).catch(() => undefined);
      emitTenantEvent(tenantId, SOCKET_EVENTS.paymentFailed, {
        transactionId,
        customerId: customer.customerId,
        amountMinor,
        reason: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        'Refund failed; all financial writes were rolled back. Retry with the same Idempotency-Key.',
        500,
        'REFUND_PROCESSING_FAILED',
        { original: err instanceof Error ? err.message : String(err) },
      );
    } finally {
      await session.endSession().catch(() => undefined);
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
        ? ApiError.conflict('This refund is already being processed', 'LOCK_CONTENTION')
        : new ApiError(
            'Distributed locking is unavailable (Redis is down) and the failure policy is fail_closed',
            503,
            'LOCK_UNAVAILABLE',
          );
    }
    throw err;
  }
}
