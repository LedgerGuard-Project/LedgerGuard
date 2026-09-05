import { AuditLogModel } from '../../models/AuditLog';
import type { BillingModels } from '../../models/billing';
import { ApiError } from '../../utils/ApiError';

export interface SearchResult {
  entity: string;
  id: string;
  label: string;
  status?: string;
  amountMinor?: number;
  currency?: string;
  date?: string;
}

const LIMIT_PER_ENTITY = 8;

/**
 * Enterprise search across customers, invoices, payments, ledger entries,
 * approvals, exceptions and audit events. Strictly tenant-scoped — the
 * tenantId is always derived from the authenticated request.
 */
export async function searchTenant(
  models: BillingModels,
  tenantId: string,
  term: string,
): Promise<{ items: SearchResult[] }> {
  const q = term.trim();
  if (q.length < 2) {
    throw ApiError.badRequest('Search term must be at least 2 characters', 'SEARCH_TERM_SHORT');
  }
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const items: SearchResult[] = [];

  const [customers, invoices, payments, approvals, exceptions, audit] = await Promise.all([
    models.Customer.find({ tenantId, $or: [{ name: rx }, { customerId: rx }, { email: rx }] })
      .limit(LIMIT_PER_ENTITY)
      .select('customerId name email currency status createdAt'),
    models.Invoice.find({ tenantId, $or: [{ invoiceId: rx }, { invoiceNumber: rx }] })
      .limit(LIMIT_PER_ENTITY)
      .select('invoiceId invoiceNumber customerId totalMinor currency status issueDate'),
    models.LedgerTransaction.find({ tenantId, transactionId: rx })
      .limit(LIMIT_PER_ENTITY)
      .select('transactionId customerId amountMinor currency status reference type createdAt'),
    models.ApprovalRequest.find({ tenantId, approvalId: rx })
      .limit(LIMIT_PER_ENTITY)
      .select('approvalId resourceType resourceName amountMinor currency status createdAt'),
    models.PaymentException.find({ tenantId, exceptionId: rx })
      .limit(LIMIT_PER_ENTITY)
      .select('exceptionId type severity amountMinor currency status createdAt'),
    AuditLogModel.find({ tenantId, $or: [{ action: rx }, { resource: rx }, { resourceId: rx }] })
      .limit(LIMIT_PER_ENTITY)
      .select('action resource resourceId actorEmail createdAt'),
  ]);

  for (const c of customers) {
    items.push({ entity: 'customer', id: c.customerId, label: c.name, status: c.status, date: c.createdAt.toISOString() });
  }
  for (const i of invoices) {
    items.push({
      entity: 'invoice', id: i.invoiceId, label: i.invoiceNumber ?? i.invoiceId,
      status: i.status, amountMinor: i.totalMinor, currency: i.currency, date: i.issueDate.toISOString(),
    });
  }
  for (const p of payments) {
    items.push({
      entity: 'payment', id: p.transactionId, label: `${p.transactionId}${p.reference ? ` (${p.reference})` : ''}`,
      status: p.status, amountMinor: p.amountMinor, currency: p.currency, date: p.createdAt.toISOString(),
    });
  }
  for (const a of approvals) {
    items.push({
      entity: 'approval', id: a.approvalId, label: `${a.resourceName ?? a.resourceId} (${a.resourceType})`,
      status: a.status, amountMinor: a.amountMinor, currency: a.currency, date: a.createdAt.toISOString(),
    });
  }
  for (const e of exceptions) {
    items.push({
      entity: 'exception', id: e.exceptionId, label: `${e.type.replace(/_/g, ' ')} — ${e.reason.slice(0, 60)}`,
      status: e.status, amountMinor: e.amountMinor, currency: e.currency, date: e.createdAt.toISOString(),
    });
  }
  for (const a of audit) {
    items.push({
      entity: 'audit', id: a.resourceId ?? String(a._id),
      label: `${a.action.replace(/_/g, ' ')}${a.resource ? ` (${a.resource})` : ''}`,
      date: a.createdAt.toISOString(),
    });
  }

  return { items };
}