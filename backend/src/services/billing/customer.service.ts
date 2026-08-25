import type { CustomerStatus } from '@ledgerguard/shared';
import type { CustomerDocument } from '../../models/billing/Customer';
import type { BillingModels } from '../../models/billing';
import { ApiError } from '../../utils/ApiError';
import { newCustomerId } from '../../utils/ids';
import { parsePagination } from '../../utils/pagination';
import type { Pagination } from '../../types';

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  taxId?: string;
  currency?: string;
  status?: CustomerStatus;
}

export interface CustomerQuery {
  search?: string;
  status?: CustomerStatus;
  page?: number;
  perPage?: number;
}

export async function createCustomer(
  models: BillingModels,
  tenantId: string,
  input: CreateCustomerInput,
): Promise<CustomerDocument> {
  const email = input.email?.toLowerCase().trim();
  if (email) {
    const existing = await models.Customer.findOne({ tenantId, email });
    if (existing) {
      throw ApiError.conflict('A customer with that email already exists', 'CUSTOMER_EMAIL_TAKEN');
    }
  }

  const customer = await models.Customer.create({
    customerId: newCustomerId(),
    tenantId,
    name: input.name.trim(),
    email,
    phone: input.phone?.trim(),
    companyName: input.companyName?.trim(),
    billingAddress: input.billingAddress,
    taxId: input.taxId?.trim(),
    status: input.status ?? 'active',
  });

  // Every customer gets a billing account so payments have a balance target.
  await ensureAccountForCustomer(models, tenantId, customer, input.currency);
  return customer;
}

export async function ensureAccountForCustomer(
  models: BillingModels,
  tenantId: string,
  customer: CustomerDocument,
  currency = 'USD',
): Promise<import('../../models/billing/BillingAccount').BillingAccountDocument> {
  const existing = await models.BillingAccount.findOne({ tenantId, customerId: customer.customerId });
  if (existing) {
    if (existing.currency !== currency.toUpperCase()) {
      // Documented simplification: one balance per customer, first currency wins
      // unless the customer has never transacted (balance 0).
      if (existing.balanceMinor === 0) {
        existing.currency = currency.toUpperCase();
        await existing.save();
      }
    }
    return existing;
  }
  return models.BillingAccount.create({
    accountId: `ACC-${customer.customerId.slice(4)}`,
    tenantId,
    customerId: customer.customerId,
    customerName: customer.name,
    currency: currency.toUpperCase(),
    balanceMinor: 0,
    creditLimitMinor: 0,
    status: 'active',
  });
}

export async function getCustomerByKey(
  models: BillingModels,
  tenantId: string,
  customerId: string,
): Promise<CustomerDocument> {
  const customer = await models.Customer.findOne({ tenantId, customerId });
  if (!customer) {
    throw ApiError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
  }
  return customer;
}

export async function getCustomerById(
  models: BillingModels,
  tenantId: string,
  id: string,
): Promise<CustomerDocument> {
  const customer = await models.Customer.findOne({ tenantId, _id: id });
  if (!customer) {
    throw ApiError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
  }
  return customer;
}

export async function listCustomers(
  models: BillingModels,
  tenantId: string,
  query: CustomerQuery,
): Promise<{ items: CustomerDocument[]; total: number; pagination: Pagination }> {
  const pagination = parsePagination(query as unknown as Record<string, unknown>);
  const filter: Record<string, unknown> = { tenantId };

  if (query.status) filter.status = query.status;
  if (query.search) {
    const term = query.search.trim();
    filter.$or = [
      { name: { $regex: escapeRegExp(term), $options: 'i' } },
      { companyName: { $regex: escapeRegExp(term), $options: 'i' } },
      { email: { $regex: escapeRegExp(term), $options: 'i' } },
      { customerId: { $regex: escapeRegExp(term), $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    models.Customer.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.perPage),
    models.Customer.countDocuments(filter),
  ]);

  return { items, total, pagination };
}

export async function updateCustomer(
  models: BillingModels,
  tenantId: string,
  customerId: string,
  patch: Partial<CreateCustomerInput>,
): Promise<CustomerDocument> {
  const customer = await getCustomerByKey(models, tenantId, customerId);
  const allowed: Array<keyof CreateCustomerInput> = [
    'name',
    'email',
    'phone',
    'companyName',
    'billingAddress',
    'taxId',
    'status',
  ];
  for (const key of allowed) {
    const value = patch[key];
    if (value !== undefined) {
      const doc = customer as unknown as Record<string, unknown>;
      doc[key] =
        key === 'email' && typeof value === 'string' ? value.toLowerCase().trim() : value;
    }
  }
  await customer.save();
  return customer;
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
