import type { BillingAccountDocument } from '../../models/billing/BillingAccount';
import type { BillingModels } from '../../models/billing';
import { ApiError } from '../../utils/ApiError';
import { parsePagination } from '../../utils/pagination';
import { fromMinor, roundMoney } from '../../utils/money';
import type { Pagination } from '../../types';

export interface AccountQuery {
  status?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

export async function listAccounts(
  models: BillingModels,
  tenantId: string,
  query: AccountQuery,
): Promise<{ items: BillingAccountDocument[]; total: number; pagination: Pagination }> {
  const pagination = parsePagination(query as unknown as Record<string, unknown>);
  const filter: Record<string, unknown> = { tenantId };
  if (query.status) filter.status = query.status;
  if (query.search) {
    const term = query.search.trim();
    filter.$or = [
      { customerName: { $regex: escapeRegExp(term), $options: 'i' } },
      { customerId: { $regex: escapeRegExp(term), $options: 'i' } },
      { accountId: { $regex: escapeRegExp(term), $options: 'i' } },
    ];
  }
  const [items, total] = await Promise.all([
    models.BillingAccount.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.perPage),
    models.BillingAccount.countDocuments(filter),
  ]);
  return { items, total, pagination };
}

export async function getAccount(
  models: BillingModels,
  tenantId: string,
  accountId: string,
): Promise<BillingAccountDocument> {
  const account = await models.BillingAccount.findOne({ tenantId, accountId });
  if (!account) throw ApiError.notFound('Billing account not found', 'ACCOUNT_NOT_FOUND');
  return account;
}

export async function getAccountByCustomer(
  models: BillingModels,
  tenantId: string,
  customerId: string,
): Promise<BillingAccountDocument | null> {
  return models.BillingAccount.findOne({ tenantId, customerId });
}

/** Integer minor placeholder used by dashboard sums. */
export function minorOf(account: BillingAccountDocument): number {
  return account.balanceMinor;
}

export function toDisplayBalance(account: BillingAccountDocument): number {
  return roundMoney(fromMinor(account.balanceMinor));
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
