import type { Response } from 'express';
import { AuditAction, BILLING_RULE_TYPES, RULE_CONDITION_OPERATORS } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createRule,
  listRules,
  getRule,
  setRuleStatus,
  duplicateRule,
  updateRule,
} from '../../services/billing/billingRules.service';
import { writeAudit } from '../../services/audit.service';

const actor = (req: AuthenticatedRequest) => ({ id: req.authUser!.id, email: req.authUser!.email });

function parseConditions(body: unknown): Array<{ field: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'; value: string }> {
  const arr = Array.isArray(body) ? body : [];
  return arr
    .filter((c): c is { field: string; operator: string; value: string } =>
      Boolean(c) && typeof (c as { field?: string }).field === 'string' && typeof (c as { value?: string }).value === 'string',
    )
    .map((c) => ({
      field: String(c.field),
      operator: (RULE_CONDITION_OPERATORS.includes(c.operator as never) ? c.operator : 'eq') as 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in',
      value: String(c.value),
    }));
}

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const items = await listRules(req.tc!.models.billing, req.tc!.tenant.tenantId);
  res.json({ success: true, data: { items, ruleTypes: BILLING_RULE_TYPES } });
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const doc = await createRule(req.tc!.models.billing, tenantId, {
    name: String(req.body.name ?? ''),
    type: req.body.type,
    priority: Number(req.body.priority ?? 0),
    effectiveFrom: String(req.body.effectiveFrom ?? new Date().toISOString()),
    effectiveTo: req.body.effectiveTo ? String(req.body.effectiveTo) : undefined,
    conditions: parseConditions(req.body.conditions),
    action: req.body.action ?? {},
  }, actor(req));
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.BillingRuleCreated,
    resource: 'billing_rule',
    resourceId: doc.ruleId,
    details: { name: doc.name, type: doc.type, priority: doc.priority },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(201).json({ success: true, data: { rule: doc.toJSON() } });
});

export const detail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const doc = await getRule(req.tc!.models.billing, req.tc!.tenant.tenantId, req.params.ruleId);
  res.json({ success: true, data: { rule: doc.toJSON() } });
});

export const patch = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const patch: Record<string, unknown> = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name);
  if (req.body.priority !== undefined) patch.priority = Number(req.body.priority);
  if (req.body.effectiveFrom !== undefined) patch.effectiveFrom = String(req.body.effectiveFrom);
  if (req.body.effectiveTo !== undefined) patch.effectiveTo = req.body.effectiveTo ? String(req.body.effectiveTo) : undefined;
  if (req.body.conditions !== undefined) patch.conditions = parseConditions(req.body.conditions);
  if (req.body.action !== undefined) patch.action = req.body.action;
  const doc = await updateRule(req.tc!.models.billing, tenantId, req.params.ruleId, patch);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.BillingRuleUpdated,
    resource: 'billing_rule',
    resourceId: doc.ruleId,
    details: { version: doc.version },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { rule: doc.toJSON() } });
});

export const setStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const status = req.body.status === 'disabled' ? 'disabled' : 'active';
  const doc = await setRuleStatus(req.tc!.models.billing, tenantId, req.params.ruleId, status);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.BillingRuleStatusChanged,
    resource: 'billing_rule',
    resourceId: doc.ruleId,
    details: { status },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { rule: doc.toJSON() } });
});

export const duplicate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const doc = await duplicateRule(req.tc!.models.billing, tenantId, req.params.ruleId, actor(req));
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.BillingRuleCreated,
    resource: 'billing_rule',
    resourceId: doc.ruleId,
    details: { duplicatedFrom: req.params.ruleId },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(201).json({ success: true, data: { rule: doc.toJSON() } });
});