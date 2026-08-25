import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import { listAccounts, getAccount } from '../../services/billing/account.service';
import { serializeAccount } from '../../services/billing/serializers';
import { getCustomerByKey } from '../../services/billing/customer.service';
import { ApiError } from '../../utils/ApiError';

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await listAccounts(req.tc!.models.billing, req.tc!.tenant.tenantId, {
    status: (req.query.status as string) || undefined,
    search: (req.query.search as string) || undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    perPage: req.query.perPage ? Number(req.query.perPage) : undefined,
  });
  res.json({
    success: true,
    data: {
      items: data.items.map((a) => serializeAccount(a)),
      total: data.total,
      page: data.pagination.page,
      perPage: data.pagination.perPage,
    },
  });
});

export const detail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const account = await getAccount(models, tenantId, req.params.accountId);
  const customer = await getCustomerByKey(models, tenantId, account.customerId).catch(() => null);
  if (!customer) throw ApiError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
  const transactions = await models.LedgerTransaction.find({ tenantId, accountId: account.accountId })
    .sort({ createdAt: -1 })
    .limit(50);
  const entries = await models.LedgerEntry.find({ tenantId, accountId: account.accountId })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json({
    success: true,
    data: {
      account: serializeAccount(account),
      customer: customer.toJSON(),
      entries: entries.map((e) => e.toJSON()),
      transactions: transactions.map((t) => t.toJSON()),
    },
  });
});