import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import { listLedger, getTransactionEntries } from '../../services/billing/ledger.service';
import { AuditLogModel } from '../../models/AuditLog';
import { fromMinor, roundMoney } from '../../utils/money';
import { ApiError } from '../../utils/ApiError';

export const listTransactions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await listLedger(req.tc!.models.billing, req.tc!.tenant.tenantId, {
    transactionId: (req.query.transactionId as string) || undefined,
    accountId: (req.query.accountId as string) || undefined,
    customerId: (req.query.customerId as string) || undefined,
    type: (req.query.type as string) || undefined,
    status: (req.query.status as string) || undefined,
    from: (req.query.from as string) || undefined,
    to: (req.query.to as string) || undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    perPage: req.query.perPage ? Number(req.query.perPage) : undefined,
  });
  res.json({ success: true, data });
});

export const transactionDetail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const transaction = await models.LedgerTransaction.findOne({
    tenantId,
    transactionId: req.params.transactionId,
  });
  if (!transaction) throw ApiError.notFound('Transaction not found', 'TRANSACTION_NOT_FOUND');

  const [entries, auditEvents, idempotency] = await Promise.all([
    getTransactionEntries(models, tenantId, transaction.transactionId),
    AuditLogModel.find({
      tenantId,
      resourceId: transaction.transactionId,
    }).sort({ createdAt: -1 }),
    transaction.idempotencyKey
      ? models.IdempotencyRecord.findOne({ tenantId, key: transaction.idempotencyKey })
      : null,
  ]);

  const customer = await models.Customer.findOne({ tenantId, customerId: transaction.customerId });

  res.json({
    success: true,
    data: {
      transaction: { ...transaction.toJSON(), amount: roundMoney(fromMinor(transaction.amountMinor)) },
      customer: customer ? { customerId: customer.customerId, name: customer.name } : null,
      entries: entries.map((e) => e.toJSON()),
      auditEvents: auditEvents.map((a) => a.toJSON()),
      idempotency: idempotency ? idempotency.toJSON() : null,
    },
  });
});