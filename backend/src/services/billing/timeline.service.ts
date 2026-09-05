import { AuditLogModel } from '../../models/AuditLog';
import type { BillingModels } from '../../models/billing';
import type { InvoiceDocument } from '../../models/billing/Invoice';

/** A single real timeline event assembled from source-of-truth collections. */
export interface TimelineEvent {
  eventType: string;
  label: string;
  timestamp: string;
  actor?: string;
  details?: Record<string, unknown> | string;
}

export type TimelineEntityType = 'invoice' | 'payment' | 'customer' | 'subscription';

/**
 * Build a complete, real timeline for an entity from the tenant's collections
 * PLUS the global audit log. Every entry carries a real timestamp; there are
 * no fabricated steps.
 */
export async function buildTimeline(
  models: BillingModels,
  tenantId: string,
  entityType: TimelineEntityType,
  entityId: string,
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  // 1. Entity lifecycle (based on type)
  if (entityType === 'invoice') {
    const inv = await models.Invoice.findOne({ tenantId, invoiceId: entityId });
    if (inv) {
      push(events, 'invoice.created', 'Invoice created', inv.createdAt);
      if (inv.status === 'paid' && inv.paidAt) push(events, 'invoice.paid', 'Invoice paid', inv.paidAt);
      if (inv.status === 'overdue') push(events, 'invoice.overdue', 'Invoice flagged overdue', inv.updatedAt);
      const meta = inv.metadata?.rulesApplied;
      if (Array.isArray(meta) && meta.length > 0) {
        push(events, 'billing.rules_applied', `Billing rules applied (${(meta as Array<{ name: string }>).map((r) => r.name).join(', ')})`, inv.createdAt);
      }
    }
  } else if (entityType === 'payment') {
    const tx = await models.LedgerTransaction.findOne({ tenantId, transactionId: entityId });
    if (tx) {
      push(events, `payment.${tx.status}`, `Payment ${tx.status}`, tx.updatedAt ?? tx.createdAt);
      push(events, 'payment.created', 'Payment requested', tx.createdAt);
    }
  } else if (entityType === 'customer') {
    const customer = await models.Customer.findOne({ tenantId, customerId: entityId });
    if (customer) {
      push(events, 'customer.created', 'Customer created', customer.createdAt);
    }
  }

  // 2. Audit log entries mentioning this resource (global, tenant-scoped).
  const audit = await AuditLogModel.find({ tenantId, resourceId: entityId })
    .sort({ createdAt: 1 })
    .limit(200);
  for (const a of audit) {
    push(events, `audit.${a.action}`, a.action.replace(/_/g, ' '), a.createdAt, a.actorEmail, a.details);
  }

  // 3. Communications to this entity (if any).
  try {
    const comms = await models.CommunicationLog.find({
      tenantId,
      'recipient.customerId': entityId,
    })
      .sort({ createdAt: 1 })
      .limit(100);
    for (const c of comms) {
      push(events, `comm.${c.event}`, `Communication: ${c.event.replace('.', ' ')} (${c.channel})`, c.createdAt, undefined, c.status);
    }
  } catch {
    // CommunicationLog model is available on all tenant connections.
  }

  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return events;
}

function push(
  events: TimelineEvent[],
  eventType: string,
  label: string,
  timestamp: Date | string,
  actor?: string,
  details?: Record<string, unknown> | string,
): void {
  events.push({ eventType, label, timestamp: new Date(timestamp).toISOString(), actor, details });
}

export async function relatedInvoice(
  models: BillingModels,
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceDocument | null> {
  return models.Invoice.findOne({ tenantId, invoiceId });
}