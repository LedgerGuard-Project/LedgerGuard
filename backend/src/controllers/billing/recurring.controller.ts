import type { Response } from 'express';
import { AuditAction } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createPlan,
  listPlans,
  getPlan,
  updatePlan,
  setPlanStatus,
  previewNextInvoice,
  processDuePlans,
} from '../../services/billing/recurring.service';
import { serializeRecurringPlan } from '../../services/billing/serializers';
import { writeAudit } from '../../services/audit.service';
import { generateIdempotencyKey } from '../../services/idempotency.service';

function idempotencyKeyFrom(req: AuthenticatedRequest): string {
  const header = req.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;
  if (value && typeof value === 'string' && value.trim().length > 0) return value.trim().slice(0, 200);
  return generateIdempotencyKey();
}

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const plan = await createPlan(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    req.body,
  );
  res.status(201).json({ success: true, data: { plan: serializeRecurringPlan(plan) } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const plans = await listPlans(req.tc!.models.billing, req.tc!.tenant.tenantId);
  res.json({ success: true, data: { items: plans.map((p) => serializeRecurringPlan(p)) } });
});

export const detail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const plan = await getPlan(req.tc!.models.billing, req.tc!.tenant.tenantId, req.params.planId);
  res.json({ success: true, data: { plan: serializeRecurringPlan(plan) } });
});

export const patch = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const plan = await updatePlan(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.planId,
    req.body,
  );
  res.json({ success: true, data: { plan: serializeRecurringPlan(plan) } });
});

export const preview = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const plan = await getPlan(req.tc!.models.billing, req.tc!.tenant.tenantId, req.params.planId);
  const preview = await previewNextInvoice(req.tc!.models.billing, req.tc!.tenant.tenantId, plan);
  res.json({ success: true, data: { preview } });
});

export const setStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const status = req.body.status as 'active' | 'paused' | 'cancelled';
  const plan = await setPlanStatus(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.planId,
    status,
  );
  res.json({ success: true, data: { plan: serializeRecurringPlan(plan) } });
});

/** Manually run the recurring generation sweep (idempotent via Idempotency-Key). */
export const runSweep = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  void idempotencyKeyFrom(req);
  const outcome = await processDuePlans(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
  );
  await writeAudit({
    tenantId: req.tc!.tenant.tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.RecurringInvoiceGenerated,
    resource: 'recurring',
    details: { generated: outcome.generated.length, skipped: outcome.skipped.length },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  }).catch(() => undefined);
  res.json({ success: true, data: outcome });
});