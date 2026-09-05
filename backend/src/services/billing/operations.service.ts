import { DEFAULT_SLA_HOURS, type SlaStatus } from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import { evaluateSla, slaDeadline, type SlaEvaluation } from '../../utils/sla';

export type OperationsItemType =
  | 'pending_approval'
  | 'failed_payment'
  | 'overdue_invoice'
  | 'exception'
  | 'failed_webhook';

export interface OperationsItem {
  /** Stable id usable for links, e.g. "APR-..." or "EXC-...". */
  id: string;
  type: OperationsItemType;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  owner: string | null;
  amountMinor: number | null;
  currency: string | null;
  createdAt: string;
  sla: SlaEvaluation;
  link: string;
}

export type OperationsSummary = Array<{ type: OperationsItemType; count: number; breached: number }>;

const ITEM_LIMIT = 25;

function sortPriority(a: OperationsItem, b: OperationsItem): number {
  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const bySla = Number(a.sla.status === 'breached') - Number(b.sla.status === 'breached');
  if (bySla !== 0) return bySla;
  return order[a.priority] - order[b.priority];
}

/**
 * Build the unified finance operations work queue from REAL data across the
 * tenant's collections. Every item carries an SLA computed from actual
 * timestamps (no fake timers).
 */
export async function buildOperationsQueue(
  models: BillingModels,
  tenantId: string,
  now: Date = new Date(),
): Promise<{ items: OperationsItem[]; summary: OperationsSummary }> {
  const [pendingApprovals, failedPayments, overdueInvoices, openExceptions, failedDeliveries] =
    await Promise.all([
      models.ApprovalRequest.find({ tenantId, status: 'pending' })
        .sort({ createdAt: 1 })
        .limit(ITEM_LIMIT)
        .select(
          'approvalId resourceType resourceName requesterEmail amountMinor currency createdAt thresholdMinor',
        ),
      models.LedgerTransaction.find({ tenantId, type: 'charge', status: 'failed' })
        .sort({ updatedAt: 1 })
        .limit(ITEM_LIMIT)
        .select('transactionId customerId amountMinor currency failureReason createdAt updatedAt'),
      models.Invoice.find({ tenantId, status: 'overdue' })
        .sort({ dueDate: 1 })
        .limit(ITEM_LIMIT)
        .select('invoiceId customerId totalMinor currency dueDate createdAt'),
      models.PaymentException.find({ tenantId, status: { $in: ['open', 'investigating'] } })
        .sort({ createdAt: 1 })
        .limit(ITEM_LIMIT)
        .select('exceptionId type severity status amountMinor currency createdAt dueAt assignedTo'),
      models.WebhookDelivery.find({ tenantId, status: { $in: ['failed', 'exhausted'] } })
        .sort({ createdAt: 1 })
        .limit(ITEM_LIMIT)
        .select('deliveryId endpointId eventType status error createdAt'),
    ]);

  const items: OperationsItem[] = [];

  for (const a of pendingApprovals) {
    const sla = evaluateSla(
      a.createdAt,
      slaDeadline(a.createdAt, DEFAULT_SLA_HOURS.approval ?? 8),
      null,
      now,
    );
    const highValue = a.thresholdMinor > 0 && a.amountMinor >= a.thresholdMinor;
    items.push({
      id: a.approvalId,
      type: 'pending_approval',
      title: `Approval: ${a.resourceName ?? a.resourceId} (${a.resourceType})`,
      priority: highValue ? 'high' : 'medium',
      status: 'pending',
      owner: a.requesterEmail ?? null,
      amountMinor: a.amountMinor,
      currency: a.currency,
      createdAt: new Date(a.createdAt).toISOString(),
      sla,
      link: '/billing/approvals',
    });
  }

  for (const p of failedPayments) {
    const stamp = p.updatedAt ?? p.createdAt;
    items.push({
      id: p.transactionId,
      type: 'failed_payment',
      title: `Failed payment: ${p.transactionId}${p.failureReason ? ` — ${p.failureReason}` : ''}`,
      priority: 'critical',
      status: 'failed',
      owner: null,
      amountMinor: p.amountMinor,
      currency: p.currency,
      createdAt: new Date(stamp).toISOString(),
      sla: evaluateSla(stamp, slaDeadline(stamp, DEFAULT_SLA_HOURS.failed_payment ?? 4), null, now),
      link: `/billing/transactions/${p.transactionId}`,
    });
  }

  for (const inv of overdueInvoices) {
    const stamp = inv.dueDate ?? inv.createdAt;
    items.push({
      id: inv.invoiceId,
      type: 'overdue_invoice',
      title: `Overdue invoice: ${inv.invoiceId}`,
      priority: 'high',
      status: 'overdue',
      owner: null,
      amountMinor: inv.totalMinor,
      currency: inv.currency,
      createdAt: new Date(stamp).toISOString(),
      sla: evaluateSla(stamp, slaDeadline(stamp, DEFAULT_SLA_HOURS.overdue_invoice ?? 48), null, now),
      link: `/billing/invoices/${inv.invoiceId}`,
    });
  }

  for (const e of openExceptions) {
    const severityPriority = {
      critical: 'critical',
      high: 'high',
      medium: 'medium',
      low: 'low',
    } as const;
    items.push({
      id: e.exceptionId,
      type: 'exception',
      title: `Exception: ${String(e.type).replace(/_/g, ' ')} — ${e.reason.slice(0, 80)}`,
      priority: severityPriority[e.severity as keyof typeof severityPriority] ?? 'medium',
      status: e.status,
      owner: e.assignedTo?.email ?? null,
      amountMinor: e.amountMinor,
      currency: e.currency,
      createdAt: new Date(e.createdAt).toISOString(),
      sla: evaluateSla(e.createdAt, e.dueAt, null, now),
      link: `/reconciliation/exceptions?exceptionId=${e.exceptionId}`,
    });
  }

  for (const d of failedDeliveries) {
    items.push({
      id: d.deliveryId,
      type: 'failed_webhook',
      title: `Webhook ${d.status}: ${d.eventType} → ${d.endpointId}${d.error ? ` (${d.error})` : ''}`,
      priority: d.status === 'exhausted' ? 'high' : 'medium',
      status: d.status,
      owner: null,
      amountMinor: null,
      currency: null,
      createdAt: new Date(d.createdAt).toISOString(),
      sla: evaluateSla(
        d.createdAt,
        slaDeadline(d.createdAt, DEFAULT_SLA_HOURS.webhook_failure ?? 2),
        null,
        now,
      ),
      link: '/developer/webhooks',
    });
  }

  items.sort(sortPriority);

  const summary: OperationsSummary = (
    ['pending_approval', 'failed_payment', 'overdue_invoice', 'exception', 'failed_webhook'] as const
  ).map((type) => ({
    type,
    count: items.filter((i) => i.type === type).length,
    breached: items.filter((i) => i.type === type && i.sla.status === 'breached').length,
  }));

  return { items, summary };
}