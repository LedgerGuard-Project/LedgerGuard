import { SOCKET_EVENTS, AuditAction, RECURRING_INTERVALS } from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import type { RecurringPlanDocument } from '../../models/billing/RecurringPlan';
import type { RecurringInvoicePreview } from '@ledgerguard/shared';
import { ApiError } from '../../utils/ApiError';
import { newRecurringPlanId } from '../../utils/ids';
import { fromMinor, roundMoney } from '../../utils/money';
import { distributedLockService, LockError } from '../DistributedLockService';
import { createInvoice } from './invoice.service';
import { createNotification } from './notification.service';
import { writeAudit } from '../audit.service';
import { emitTenantEvent } from '../../sockets/eventBus';
import { getCustomerByKey } from './customer.service';
import { logger } from '../../utils/logger';

export interface CreatePlanInput {
  customerId: string;
  name: string;
  description?: string;
  amountMinor: number;
  currency: string;
  interval: typeof RECURRING_INTERVALS[number];
  intervalCount?: number;
  startDate: string;
  nextBillingDate?: string;
  endDate?: string;
  invoiceStatus?: 'draft' | 'issued';
  autoGenerate?: boolean;
}

export interface UpdatePlanPatch {
  name?: string;
  description?: string;
  interval?: typeof RECURRING_INTERVALS[number];
  intervalCount?: number;
  amountMinor?: number;
  nextBillingDate?: string;
  endDate?: string;
  invoiceStatus?: 'draft' | 'issued';
}

type Actor = { id: string; email: string };

/** Advance a date by `count` intervals, handling month/year rollover. */
export function addIntervals(date: string, interval: string, count: number): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  let months = 0;
  if (interval === 'monthly') months = 1 * count;
  else if (interval === 'quarterly') months = 3 * count;
  else if (interval === 'yearly') months = 12 * count;
  else months = 1 * count;
  const next = new Date(year, month + months, day, 12, 0, 0, 0);
  if (Number.isNaN(next.getTime())) {
    // Clamp to the last day of the target month on overflow.
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0, 12, 0, 0, 0);
    return last.toISOString().slice(0, 10);
  }
  return next.toISOString().slice(0, 10);
}

export async function createPlan(
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  input: CreatePlanInput,
): Promise<RecurringPlanDocument> {
  const customer = await getCustomerByKey(models, tenantId, input.customerId);
  if (!Number.isFinite(input.amountMinor) || input.amountMinor < 1) {
    throw ApiError.badRequest('Plan amount must be positive (minor units)', 'INVALID_AMOUNT');
  }
  if (!RECURRING_INTERVALS.includes(input.interval)) {
    throw ApiError.badRequest('Unsupported interval', 'INVALID_INTERVAL');
  }
  const intervalCount = input.intervalCount ?? 1;
  if (!Number.isInteger(intervalCount) || intervalCount < 1) {
    throw ApiError.badRequest('intervalCount must be a positive integer', 'INVALID_INTERVAL_COUNT');
  }
  const startDate = input.startDate.slice(0, 10);
  const nextBillingDate = (input.nextBillingDate ?? input.startDate).slice(0, 10);
  const plan = await models.RecurringPlan.create({
    planId: newRecurringPlanId(),
    tenantId,
    customerId: customer.customerId,
    customerName: customer.name,
    name: input.name.trim(),
    description: input.description?.trim(),
    amountMinor: Math.round(input.amountMinor),
    currency: input.currency.toUpperCase(),
    interval: input.interval,
    intervalCount,
    startDate,
    nextBillingDate,
    endDate: input.endDate?.slice(0, 10),
    status: 'active',
    invoiceStatus: input.invoiceStatus ?? 'draft',
    autoGenerate: input.autoGenerate ?? true,
  });
  await writeAudit({
    tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.RecurringPlanCreated,
    resource: 'recurring',
    resourceId: plan.planId,
    details: { amountMinor: plan.amountMinor, interval: plan.interval },
    ip: undefined,
  }).catch((auditErr) => logger.warn('audit RecurringPlanCreated failed', { auditErr }));
  return plan;
}
export async function listPlans(
  models: BillingModels,
  tenantId: string,
): Promise<RecurringPlanDocument[]> {
  return models.RecurringPlan.find({ tenantId }).sort({ createdAt: -1 });
}

export async function getPlan(
  models: BillingModels,
  tenantId: string,
  planId: string,
): Promise<RecurringPlanDocument> {
  const plan = await models.RecurringPlan.findOne({ tenantId, planId });
  if (!plan) throw ApiError.notFound('Recurring plan not found', 'PLAN_NOT_FOUND');
  return plan;
}

export async function updatePlan(
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  planId: string,
  patch: UpdatePlanPatch,
): Promise<RecurringPlanDocument> {
  const plan = await getPlan(models, tenantId, planId);
  if (patch.name !== undefined) plan.name = patch.name.trim();
  if (patch.description !== undefined) plan.description = patch.description?.trim();
  if (patch.interval !== undefined) {
    if (!RECURRING_INTERVALS.includes(patch.interval)) {
      throw ApiError.badRequest('Unsupported interval', 'INVALID_INTERVAL');
    }
    plan.interval = patch.interval;
  }
  if (patch.intervalCount !== undefined) plan.intervalCount = patch.intervalCount;
  if (patch.amountMinor !== undefined) plan.amountMinor = Math.round(patch.amountMinor);
  if (patch.nextBillingDate !== undefined) plan.nextBillingDate = patch.nextBillingDate.slice(0, 10);
  if (patch.endDate !== undefined) plan.endDate = patch.endDate.slice(0, 10);
  if (patch.invoiceStatus !== undefined) plan.invoiceStatus = patch.invoiceStatus;
  await plan.save();
  await writeAudit({
    tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.RecurringPlanUpdated,
    resource: 'recurring',
    resourceId: plan.planId,
    ip: undefined,
  }).catch((auditErr) => logger.warn('audit RecurringPlanUpdated failed', { auditErr }));
  return plan;
}

export async function setPlanStatus(
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  planId: string,
  status: 'active' | 'paused' | 'cancelled',
): Promise<RecurringPlanDocument> {
  const plan = await getPlan(models, tenantId, planId);
  plan.status = status;
  await plan.save();
  const action =
    status === 'paused'
      ? AuditAction.RecurringPlanPaused
      : status === 'cancelled'
        ? AuditAction.RecurringPlanCancelled
        : AuditAction.RecurringPlanResumed;
  await writeAudit({
    tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action,
    resource: 'recurring',
    resourceId: plan.planId,
    ip: undefined,
  }).catch((auditErr) => logger.warn('audit recurring status failed', { auditErr }));
  await createNotification(models, tenantId, {
    type: 'recurring',
    title: `Recurring plan ${status}`,
    message: `${plan.name} was ${status}`,
    data: { planId: plan.planId },
  });
  emitTenantEvent(tenantId, SOCKET_EVENTS.recurringBillingPaused, { planId, status });
  return plan;
}

export async function previewNextInvoice(
  models: BillingModels,
  tenantId: string,
  plan: RecurringPlanDocument,
): Promise<RecurringInvoicePreview> {
  const itemDescription = `Recurring: ${plan.name}`;
  return {
    planId: plan.planId,
    invoiceNumber: '',
    amount: roundMoney(fromMinor(plan.amountMinor)),
    amountMinor: plan.amountMinor,
    currency: plan.currency,
    issueDate: plan.nextBillingDate,
    dueDate: addIntervals(plan.nextBillingDate, 'monthly', 1),
    items: [
      { description: itemDescription, quantity: 1, unitPriceMinor: plan.amountMinor, amountMinor: plan.amountMinor },
    ],
  };
}
export interface GenerateOutcome {
  generated: string[];
  skipped: string[];
  processed: number;
}

/**
 * Scan active, auto-generate plans whose nextBillingDate is due (or past) and
 * create their invoices. Each plan+cycle is protected by a tenant-scoped
 * distributed lock and advances its schedule atomically, so a concurrent
 * double-sweep can never produce two invoices for the same cycle.
 */
export async function processDuePlans(
  models: BillingModels,
  tenantId: string,
  actor: Actor,
  today?: Date,
): Promise<GenerateOutcome> {
  const now = (today ?? new Date()).toISOString().slice(0, 10);
  const duePlans = await models.RecurringPlan.find({
    tenantId,
    status: 'active',
    autoGenerate: true,
    nextBillingDate: { $lte: now },
    $or: [{ endDate: { $exists: false } }, { endDate: { $gte: now } }],
  });
  const outcome: GenerateOutcome = { generated: [], skipped: [], processed: duePlans.length };
  for (const plan of duePlans) {
    const lockKey = `recurring-${plan.planId}-${plan.nextBillingDate}`;
    try {
      const { result } = await distributedLockService.withLock(tenantId, lockKey, async () => {
        const fresh = await models.RecurringPlan.findOne({ tenantId, planId: plan.planId });
        if (!fresh || fresh.status !== 'active') return 'skipped';
        if (fresh.nextBillingDate > now) return 'skipped';
        if (fresh.endDate && fresh.endDate < now) return 'skipped';
        // Duplicate guard: only generate if the schedule hasn't already advanced.
        if (fresh.lastGeneratedAt && fresh.lastGeneratedAt >= fresh.nextBillingDate) {
          return 'skipped';
        }
        const invoice = await createInvoice(models, tenantId, {
          customerId: fresh.customerId,
          currency: fresh.currency,
          items: [
            {
              description: `Recurring: ${fresh.name}`,
              quantity: 1,
              unitPrice: fromMinor(fresh.amountMinor),
            },
          ],
          status: fresh.invoiceStatus,
          issueDate: fresh.nextBillingDate,
          dueDate: addIntervals(fresh.nextBillingDate, fresh.interval, fresh.intervalCount),
        });
        fresh.lastGeneratedAt = invoice.issueDate.toISOString().slice(0, 10);
        fresh.nextBillingDate = addIntervals(
          fresh.nextBillingDate,
          fresh.interval,
          fresh.intervalCount,
        );
        await fresh.save();
        return invoice.invoiceId;
      });
      if (typeof result === 'string' && result !== 'skipped') {
        outcome.generated.push(result);
        const planAfter = await models.RecurringPlan.findOne({ tenantId, planId: plan.planId });
        emitTenantEvent(tenantId, SOCKET_EVENTS.recurringInvoiceCreated, {
          planId: plan.planId,
          invoiceId: result,
        });
        await createNotification(models, tenantId, {
          type: 'recurring',
          title: 'Recurring invoice generated',
          message: `Generated invoice ${result} for ${planAfter?.name ?? plan.name}`,
          data: { planId: plan.planId, invoiceId: result },
        }).catch(() => undefined);
        await writeAudit({
          tenantId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: AuditAction.RecurringInvoiceGenerated,
          resource: 'recurring',
          resourceId: plan.planId,
          details: { invoiceId: result },
          ip: undefined,
        }).catch((auditErr) => logger.warn('audit RecurringGenerated failed', { auditErr }));
      } else {
        outcome.skipped.push(plan.planId);
      }
    } catch (err) {
      if (err instanceof LockError && err.reason === 'contention') {
        outcome.skipped.push(plan.planId);
        continue;
      }
      throw err;
    }
  }
  return outcome;
}