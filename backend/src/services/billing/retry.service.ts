import type { Connection } from 'mongoose';
import { SOCKET_EVENTS } from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import { ApiError } from '../../utils/ApiError';
import { newTransactionId } from '../../utils/ids';
import { getAccountByCustomer } from './account.service';
import { postLedgerGroup } from './ledger.service';
import { buildChargePosting } from './payment.service';
import { getCustomerByKey } from './customer.service';
import { serializeTransaction, serializeAccount, serializeInvoice } from './serializers';
import { writeAudit } from '../audit.service';
import { emitTenantEvent } from '../../sockets/eventBus';
import { AuditAction } from '@ledgerguard/shared';
import { logger } from '../../utils/logger';

export interface RetryResult {
  status: 'completed';
  transaction: Record<string, unknown>;
  ledgerEntries: Record<string, unknown>[];
  account?: Record<string, unknown>;
  invoice?: Record<string, unknown> | null;
}

/**
 * Retry a previously FAILED charge idempotently.
 *
 * Guarantees:
 *  - only a `failed` (never completed/rolled_back) charge can be retried
 *  - the retry re-posts the SAME verified charge posting, so no duplicate
 *    ledger entries are created (the failed attempt rolled back, leaving the
 *    balance untouched)
 *  - retryCount/lastRetryAt are updated on the original failed marker so the
 *    full payment lifecycle is tracked
 */
export async function retryFailedCharge(
  connection: Connection,
  models: BillingModels,
  tenantId: string,
  actor: { id: string; email: string },
  failedTransactionId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<RetryResult> {
  const failed = await models.LedgerTransaction.findOne({
    tenantId,
    transactionId: failedTransactionId,
    type: 'charge',
  });
  if (!failed) throw ApiError.notFound('Failed payment not found', 'TRANSACTION_NOT_FOUND');
  if (failed.status !== 'failed') {
    throw ApiError.badRequest(
      `Only failed payments can be retried (current status: ${failed.status})`,
      'RETRY_NOT_ALLOWED',
    );
  }

  const customer = await getCustomerByKey(models, tenantId, failed.customerId);
  const account = await getAccountByCustomer(models, tenantId, customer.customerId);
  if (!account) throw ApiError.notFound('Billing account not found', 'ACCOUNT_NOT_FOUND');
  if (account.status !== 'active') {
    throw ApiError.badRequest('Billing account is not active', 'ACCOUNT_FROZEN');
  }
  if (account.currency !== failed.currency && account.balanceMinor !== 0) {
    throw ApiError.badRequest(
      `Account currency is ${account.currency}; retried payment must match the account currency`,
      'ACCOUNT_CURRENCY_MISMATCH',
    );
  }

  const newTxnId = newTransactionId();
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      // Prior completed charges are read BEFORE inserting this retry charge so
      // the current payment is never double-counted in the settlement math.
      const priorPaid = failed.invoiceId
        ? await models.LedgerTransaction.aggregate(
            [
              { $match: { tenantId, invoiceId: failed.invoiceId, type: 'charge', status: 'completed' } },
              { $group: { _id: null, total: { $sum: '$amountMinor' } } },
            ],
            { session },
          )
        : [];
      const priorPaidMinor = priorPaid[0]?.total ?? 0;

      await models.LedgerTransaction.create(
        [
          {
            transactionId: newTxnId,
            tenantId,
            customerId: customer.customerId,
            accountId: account.accountId,
            invoiceId: failed.invoiceId,
            amountMinor: failed.amountMinor,
            currency: failed.currency,
            type: 'charge',
            status: 'completed',
            idempotencyKey: `retry_${failed.idempotencyKey ?? failed.transactionId}`,
            reference: failed.reference,
            description: `Payment retry for ${customer.name}`,
            paymentMethod: failed.paymentMethod,
            completedAt: new Date(),
            metadata: { originalTransactionId: failed.transactionId },
          },
        ],
        { session },
      );

      await postLedgerGroup(session, models, tenantId, buildChargePosting(
        newTxnId,
        failed.currency,
        account.accountId,
        failed.amountMinor,
        `Payment retry for ${customer.name}`,
      ));

      await models.BillingAccount.updateOne(
        { tenantId, accountId: account.accountId },
        { $inc: { balanceMinor: failed.amountMinor } },
        { session },
      );

      if (failed.invoiceId) {
        const invoice = await models.Invoice.findOne(
          { tenantId, invoiceId: failed.invoiceId },
          null,
          { session },
        );
        if (invoice) {
          // Overpayment guard runs regardless of current invoice status.
          const after = priorPaidMinor + failed.amountMinor;
          if (after > invoice.totalMinor || invoice.status === 'cancelled') {
            throw ApiError.badRequest(
              `Retried payment exceeds the outstanding balance of this invoice; overpayments are not permitted`,
              'OVERPAYMENT_EXCEEDS',
            );
          }
          if (invoice.status !== 'paid') {
            if (after >= invoice.totalMinor) {
              invoice.status = 'paid';
              invoice.paidAt = new Date();
            } else if (after > 0) {
              invoice.status = 'partially_paid';
            }
            await invoice.save({ session });
          }
        }
      }

      await models.LedgerTransaction.updateOne(
        { tenantId, transactionId: failed.transactionId },
        { $inc: { retryCount: 1 }, $set: { lastRetryAt: new Date() } },
        { session },
      );
    });

    const [txn, entries, accountAfter] = await Promise.all([
      models.LedgerTransaction.findOne({ tenantId, transactionId: newTxnId }),
      models.LedgerEntry.find({ tenantId, transactionId: newTxnId }),
      getAccountByCustomer(models, tenantId, customer.customerId),
    ]);
    const ledgerEntries = entries.map((e) => e.toJSON() as Record<string, unknown>);
    const invoiceAfter = failed.invoiceId
      ? await models.Invoice.findOne({ tenantId, invoiceId: failed.invoiceId })
      : null;

    emitTenantEvent(tenantId, SOCKET_EVENTS.paymentCompleted, {
      transactionId: newTxnId,
      customerId: customer.customerId,
      amountMinor: failed.amountMinor,
      currency: failed.currency,
      reference: failed.reference,
      retriedFrom: failed.transactionId,
    });
    emitTenantEvent(tenantId, SOCKET_EVENTS.ledgerUpdated, { transactionId: newTxnId, tenantId });

    await writeAudit({
      tenantId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: AuditAction.PaymentRetried,
      resource: 'payment',
      resourceId: newTxnId,
      details: {
        originalTransactionId: failed.transactionId,
        amountMinor: failed.amountMinor,
        currency: failed.currency,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    }).catch((auditErr) => logger.warn('audit PaymentRetried failed', { auditErr }));

    return {
      status: 'completed',
      transaction: txn ? serializeTransaction(txn) : {},
      ledgerEntries,
      account: accountAfter ? serializeAccount(accountAfter) : undefined,
      invoice: invoiceAfter ? serializeInvoice(invoiceAfter) : null,
    };
  } catch (err) {
    await session.abortTransaction().catch(() => undefined);
    throw err;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}