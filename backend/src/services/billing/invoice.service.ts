import type { InvoiceStatus } from '@ledgerguard/shared';
import type { InvoiceDocument } from '../../models/billing/Invoice';
import type { BillingModels } from '../../models/billing';
import { ApiError } from '../../utils/ApiError';
import { newInvoiceId, newReference } from '../../utils/ids';
import { getCustomerByKey } from './customer.service';
import { dispatchWebhookEvent } from './webhook.service';
import { applyBillingRules } from './billingRules.service';
import { computeInvoiceTotals, type InvoiceLineInput } from './invoice.totals';

export interface CreateInvoiceInput {
  customerId: string;
  currency: string;
  items: InvoiceLineInput[];
  status?: InvoiceStatus;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  discount?: number;
}

export interface InvoiceQuery {
  status?: InvoiceStatus;
  search?: string;
  from?: string;
  to?: string;
  customerId?: string;
  page?: number;
  perPage?: number;
}

/** Generate the next per-tenant invoice number (INV-<year>-NNNN). */
export async function nextInvoiceNumber(models: BillingModels, tenantId: string): Promise<string> {
  const counter = await models.Counter.findOneAndUpdate(
    { tenantId, name: 'invoice' },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const year = new Date().getFullYear();
  return `INV-${year}-${String(counter.value).padStart(4, '0')}`;
}

export async function createInvoice(
  models: BillingModels,
  tenantId: string,
  input: CreateInvoiceInput,
): Promise<InvoiceDocument> {
  const customer = await getCustomerByKey(models, tenantId, input.customerId);
  const totals = computeInvoiceTotals(input.items, input.discount ?? 0);

  if (input.status === 'issued' && (!input.issueDate || !input.dueDate)) {
    throw ApiError.badRequest(
      'issueDate and dueDate are required to issue an invoice',
      'INVOICE_DATES_REQUIRED',
    );
  }

  // ---- Server-side billing rules must be the only authority on totals ----
  const ruleResult = await applyBillingRules(models, tenantId, {
    customerId: customer.customerId,
    currency: input.currency.toUpperCase(),
    subtotalMinor: totals.subtotalMinor,
    taxMinor: totals.taxMinor,
    discountMinor: totals.discountMinor,
  });
  const dueInDays = ruleResult.graceDays;
  const dueDate = input.dueDate
    ? new Date(input.dueDate)
    : new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);

  const invoice = await models.Invoice.create({
    invoiceId: newInvoiceId(),
    tenantId,
    customerId: customer.customerId,
    invoiceNumber: await nextInvoiceNumber(models, tenantId),
    items: totals.items,
    subtotalMinor: totals.subtotalMinor,
    taxMinor: ruleResult.taxMinor,
    discountMinor: ruleResult.discountMinor,
    totalMinor: ruleResult.totalMinor,
    currency: input.currency.toUpperCase(),
    status: input.status ?? 'draft',
    issueDate: input.issueDate ? new Date(input.issueDate) : new Date(),
    dueDate,
    notes: input.notes?.trim(),
    metadata: ruleResult.effects.length > 0 ? { rulesApplied: ruleResult.effects } : undefined,
  });

  // Webhook fan-out (fire-and-forget; never blocks or fails invoice creation).
  void dispatchWebhookEvent(models, tenantId, 'invoice.created', {
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    status: invoice.status,
    totalMinor: invoice.totalMinor,
    currency: invoice.currency,
  });

  return invoice;
}

export async function listInvoices(
  models: BillingModels,
  tenantId: string,
  query: InvoiceQuery,
): Promise<{
  items: InvoiceDocument[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}> {
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.perPage) || 20));
  const filter: Record<string, unknown> = { tenantId };
  if (query.status) filter.status = query.status;
  if (query.customerId) filter.customerId = query.customerId;
  if (query.search) {
    const term = query.search.trim();
    filter.$or = [
      { invoiceNumber: { $regex: escapeRegExp(term), $options: 'i' } },
      { invoiceId: { $regex: escapeRegExp(term), $options: 'i' } },
    ];
  }
  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) range.$gte = new Date(query.from);
    if (query.to) range.$lte = new Date(query.to);
    filter.issueDate = range;
  }

  const [items, total] = await Promise.all([
    models.Invoice.find(filter)
      .sort({ issueDate: -1, createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage),
    models.Invoice.countDocuments(filter),
  ]);

  // Opportunistically flag overdue issued invoices.
  await refreshOverdue(models, tenantId);

  return { items, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function getInvoice(
  models: BillingModels,
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceDocument> {
  const invoice = await models.Invoice.findOne({ tenantId, invoiceId });
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  return invoice;
}

export interface UpdateDraftPatch {
  items?: InvoiceLineInput[];
  discount?: number;
  notes?: string;
  dueDate?: string;
  issueDate?: string;
}

export async function updateDraftInvoice(
  models: BillingModels,
  tenantId: string,
  invoiceId: string,
  patch: UpdateDraftPatch,
): Promise<InvoiceDocument> {
  const invoice = await getInvoice(models, tenantId, invoiceId);
  if (invoice.status !== 'draft') {
    throw ApiError.badRequest('Only draft invoices can be edited', 'INVOICE_NOT_DRAFT');
  }
  if (patch.items) {
    const totals = computeInvoiceTotals(patch.items, patch.discount ?? 0);
    invoice.items = totals.items;
    invoice.subtotalMinor = totals.subtotalMinor;
    invoice.taxMinor = totals.taxMinor;
    invoice.discountMinor = totals.discountMinor;
    invoice.totalMinor = totals.totalMinor;
  }
  if (patch.notes !== undefined) invoice.notes = patch.notes?.trim();
  if (patch.dueDate) invoice.dueDate = new Date(patch.dueDate);
  if (patch.issueDate) invoice.issueDate = new Date(patch.issueDate);
  await invoice.save();
  return invoice;
}

export async function issueInvoice(
  models: BillingModels,
  tenantId: string,
  invoiceId: string,
  dueDate?: string,
): Promise<InvoiceDocument> {
  const invoice = await getInvoice(models, tenantId, invoiceId);
  if (invoice.status !== 'draft') {
    throw ApiError.badRequest('Only draft invoices can be issued', 'INVOICE_NOT_DRAFT');
  }
  invoice.status = 'issued';
  if (dueDate) invoice.dueDate = new Date(dueDate);
  if (!invoice.issueDate) invoice.issueDate = new Date();
  await invoice.save();
  return invoice;
}

export async function cancelInvoice(
  models: BillingModels,
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceDocument> {
  const invoice = await getInvoice(models, tenantId, invoiceId);
  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    throw ApiError.badRequest(
      `A ${invoice.status} invoice cannot be cancelled`,
      'INVOICE_CANNOT_CANCEL',
    );
  }
  invoice.status = 'cancelled';
  await invoice.save();
  return invoice;
}

export async function markInvoicePaid(
  models: BillingModels,
  tenantId: string,
  invoiceId: string,
  paidAt = new Date(),
): Promise<InvoiceDocument> {
  const invoice = await getInvoice(models, tenantId, invoiceId);
  if (invoice.status === 'paid') return invoice;
  if (invoice.status === 'cancelled') {
    throw ApiError.badRequest('A cancelled invoice cannot be marked paid', 'INVOICE_CANCELLED');
  }
  invoice.status = 'paid';
  invoice.paidAt = paidAt;
  await invoice.save();
  return invoice;
}

/** Flag issued invoices whose due date has passed as overdue. */
export async function refreshOverdue(models: BillingModels, tenantId: string): Promise<number> {
  const now = new Date();
  const result = await models.Invoice.updateMany(
    { tenantId, status: 'issued', dueDate: { $lt: now } },
    { $set: { status: 'overdue' } },
  );
  return result.modifiedCount ?? 0;
}

/** Neutral reference used when no payment reference is supplied. */
export function newPaidReference(): string {
  return newReference();
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
