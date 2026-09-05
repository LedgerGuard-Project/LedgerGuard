import {
  BILLING_RULE_TYPES,
  type BillingRuleEffect,
  type BillingRuleType,
  type RuleConditionOperator,
} from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import type { BillingRuleDocument } from '../../models/billing/BillingRule';
import { ApiError } from '../../utils/ApiError';
import { newBillingRuleId } from '../../utils/ids';

export interface RuleActor {
  id: string;
  email: string;
}

export interface CreateRuleInput {
  name: string;
  type: BillingRuleType;
  priority: number;
  effectiveFrom: string;
  effectiveTo?: string;
  conditions: Array<{ field: string; operator: RuleConditionOperator; value: string }>;
  action: Record<string, string | number | boolean>;
}

/** Invoice context used to evaluate rules server-side. */
export interface RuleContext {
  customerId: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
}

function conditionsMatch(rule: BillingRuleDocument, ctx: RuleContext): boolean {
  for (const c of rule.conditions) {
    const raw: unknown = (ctx as unknown as Record<string, unknown>)[c.field];
    if (raw === undefined) return false;
    if (['gt', 'gte', 'lt', 'lte'].includes(c.operator)) {
      const a = Number(raw);
      const b = Number(c.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (c.operator === 'gt' && !(a > b)) return false;
      if (c.operator === 'gte' && !(a >= b)) return false;
      if (c.operator === 'lt' && !(a < b)) return false;
      if (c.operator === 'lte' && !(a <= b)) return false;
      continue;
    }
    if (c.operator === 'eq' && String(raw) !== c.value) return false;
    if (c.operator === 'neq' && String(raw) === c.value) return false;
    if (c.operator === 'in' && !c.value.split(',').includes(String(raw))) return false;
  }
  return true;
}

async function activeRulesForType(
  models: BillingModels,
  tenantId: string,
  type: BillingRuleType,
  now: Date = new Date(),
): Promise<BillingRuleDocument[]> {
  return models.BillingRule.find({
    tenantId,
    type,
    status: 'active',
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gt: now } }],
  })
    .sort({ priority: 1, version: -1 })
    .limit(5);
}

export interface RuleEvaluationResult {
  effects: BillingRuleEffect[];
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  graceDays: number;
  lateFeePercent: number;
}

/**
 * Evaluate all applicable billing rules for an invoice context. This is the
 * ONLY place financial rule math runs — never in the client. Returns final
 * totals plus a transparent list of applied effects for the invoice metadata.
 */
export async function applyBillingRules(
  models: BillingModels,
  tenantId: string,
  ctx: RuleContext,
  now: Date = new Date(),
): Promise<RuleEvaluationResult> {
  const [discounts, taxOverrides, minimums, maximums, graces, lateFees] = await Promise.all([
    activeRulesForType(models, tenantId, 'discount', now),
    activeRulesForType(models, tenantId, 'tax_override', now),
    activeRulesForType(models, tenantId, 'minimum_charge', now),
    activeRulesForType(models, tenantId, 'maximum_charge', now),
    activeRulesForType(models, tenantId, 'grace_period', now),
    activeRulesForType(models, tenantId, 'late_fee', now),
  ]);

  const effects: BillingRuleEffect[] = [];
  const subtotalMinor = ctx.subtotalMinor;
  let discountMinor = ctx.discountMinor;
  let taxMinor = ctx.taxMinor;
  let graceDays = 30;
  let lateFeePercent = 0;

  for (const rule of discounts) {
    if (!conditionsMatch(rule, ctx)) continue;
    const percent = Number(rule.action.percent ?? 0);
    const delta = Math.round(subtotalMinor * (percent / 100));
    discountMinor = Math.max(discountMinor, delta);
    effects.push({
      ruleId: rule.ruleId,
      name: rule.name,
      version: rule.version,
      type: 'discount',
      applied: `${percent}% discount applied (${(delta / 100).toFixed(2)})`,
      deltaMinor: -delta,
    });
    break; // first matching rule of this type wins (priority order)
  }

  for (const rule of taxOverrides) {
    if (!conditionsMatch(rule, ctx)) continue;
    const percent = Number(rule.action.percent ?? 0);
    const newTax = Math.round((subtotalMinor - discountMinor) * (percent / 100));
    const taxDelta = newTax - taxMinor;
    taxMinor = newTax;
    effects.push({
      ruleId: rule.ruleId,
      name: rule.name,
      version: rule.version,
      type: 'tax_override',
      applied: `tax set to ${percent}%`,
      deltaMinor: taxDelta,
    });
    break;
  }

  for (const rule of minimums) {
    if (!conditionsMatch(rule, ctx)) continue;
    const minMinor = Number(rule.action.amountMinor ?? 0);
    const current = Math.max(0, subtotalMinor + taxMinor - discountMinor);
    if (current < minMinor) {
      effects.push({
        ruleId: rule.ruleId,
        name: rule.name,
        version: rule.version,
        type: 'minimum_charge',
        applied: `total raised to minimum ${(minMinor / 100).toFixed(2)}`,
        deltaMinor: minMinor - current,
      });
    }
    break;
  }

  for (const rule of maximums) {
    if (!conditionsMatch(rule, ctx)) continue;
    const maxMinor = Number(rule.action.amountMinor ?? 0);
    const current = Math.max(0, subtotalMinor + taxMinor - discountMinor);
    if (current > maxMinor) {
      effects.push({
        ruleId: rule.ruleId,
        name: rule.name,
        version: rule.version,
        type: 'maximum_charge',
        applied: `total capped at ${(maxMinor / 100).toFixed(2)}`,
        deltaMinor: maxMinor - current,
      });
    }
    break;
  }

  for (const rule of graces) {
    if (!conditionsMatch(rule, ctx)) continue;
    graceDays = Number(rule.action.days ?? 30);
    effects.push({
      ruleId: rule.ruleId,
      name: rule.name,
      version: rule.version,
      type: 'grace_period',
      applied: `grace period ${graceDays} days`,
    });
    break;
  }

  for (const rule of lateFees) {
    if (!conditionsMatch(rule, ctx)) continue;
    lateFeePercent = Number(rule.action.percent ?? 0);
    effects.push({
      ruleId: rule.ruleId,
      name: rule.name,
      version: rule.version,
      type: 'late_fee',
      applied: `late fee ${lateFeePercent}%`,
    });
    break;
  }

  const totalMinor = Math.max(0, subtotalMinor + taxMinor - discountMinor);
  return { effects, discountMinor, taxMinor, totalMinor, graceDays, lateFeePercent };
}

/** Reject a new/active rule whose type already has a live rule (conflict). */
async function assertNoConflicts(
  models: BillingModels,
  tenantId: string,
  type: BillingRuleType,
  ignoreRuleId?: string,
): Promise<void> {
  const existing = await models.BillingRule.findOne({
    tenantId,
    type,
    status: 'active',
    ruleId: { $ne: ignoreRuleId },
    effectiveFrom: { $lte: new Date() },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gt: new Date() } }],
  });
  if (existing) {
    throw ApiError.conflict(
      `An active ${type} rule "${existing.name}" already exists. Disable it before creating/enabling another.`,
      'RULE_CONFLICT',
    );
  }
}

function validateRule(input: CreateRuleInput): void {
  if (!input.name || input.name.trim().length === 0) {
    throw ApiError.badRequest('Rule name is required', 'RULE_NAME_REQUIRED');
  }
  if (!BILLING_RULE_TYPES.includes(input.type)) {
    throw ApiError.badRequest('Unsupported billing rule type', 'INVALID_RULE_TYPE');
  }
  if (!input.effectiveFrom || Number.isNaN(new Date(input.effectiveFrom).getTime())) {
    throw ApiError.badRequest('Effective date is required', 'RULE_EFFECTIVE_REQUIRED');
  }
  if (!Number.isFinite(input.priority) || input.priority < 0) {
    throw ApiError.badRequest('Priority must be a non-negative number', 'RULE_BAD_PRIORITY');
  }
  if (input.effectiveTo && new Date(input.effectiveTo) <= new Date(input.effectiveFrom)) {
    throw ApiError.badRequest('Effective-to must be after effective-from', 'RULE_BAD_RANGE');
  }
  if (!input.action || Object.keys(input.action).length === 0) {
    throw ApiError.badRequest('A rule must declare an action', 'RULE_ACTION_REQUIRED');
  }
}

export async function createRule(
  models: BillingModels,
  tenantId: string,
  input: CreateRuleInput,
  actor: RuleActor,
): Promise<BillingRuleDocument> {
  validateRule(input);
  if (new Date(input.effectiveFrom) <= new Date()) {
    await assertNoConflicts(models, tenantId, input.type);
  }
  return models.BillingRule.create({
    ruleId: newBillingRuleId(),
    tenantId,
    name: input.name.trim(),
    type: input.type,
    status: 'active',
    priority: input.priority,
    effectiveFrom: new Date(input.effectiveFrom),
    effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
    conditions: input.conditions,
    action: input.action,
    version: 1,
    createdBy: actor,
  });
}

export async function listRules(
  models: BillingModels,
  tenantId: string,
): Promise<BillingRuleDocument[]> {
  return models.BillingRule.find({ tenantId }).sort({ type: 1, priority: 1 }).limit(200);
}

export async function getRule(
  models: BillingModels,
  tenantId: string,
  ruleId: string,
): Promise<BillingRuleDocument> {
  const doc = await models.BillingRule.findOne({ tenantId, ruleId });
  if (!doc) throw ApiError.notFound('Rule not found', 'RULE_NOT_FOUND');
  return doc;
}

export async function setRuleStatus(
  models: BillingModels,
  tenantId: string,
  ruleId: string,
  status: 'active' | 'disabled',
): Promise<BillingRuleDocument> {
  const doc = await getRule(models, tenantId, ruleId);
  if (status === 'active' && new Date(doc.effectiveFrom) <= new Date()) {
    await assertNoConflicts(models, tenantId, doc.type, ruleId);
  }
  doc.status = status;
  await doc.save();
  return doc;
}

export async function duplicateRule(
  models: BillingModels,
  tenantId: string,
  ruleId: string,
  actor: RuleActor,
): Promise<BillingRuleDocument> {
  const src = await getRule(models, tenantId, ruleId);
  return models.BillingRule.create({
    ruleId: newBillingRuleId(),
    tenantId,
    name: `${src.name} (copy)`,
    type: src.type,
    status: 'disabled',
    priority: src.priority + 100,
    effectiveFrom: new Date(),
    effectiveTo: src.effectiveTo,
    conditions: src.conditions,
    action: src.action,
    version: 1,
    createdBy: actor,
  });
}

export async function updateRule(
  models: BillingModels,
  tenantId: string,
  ruleId: string,
  patch: Partial<CreateRuleInput>,
): Promise<BillingRuleDocument> {
  const doc = await getRule(models, tenantId, ruleId);
  if (patch.name !== undefined) doc.name = patch.name.trim();
  if (patch.type !== undefined && patch.type !== doc.type) {
    throw ApiError.badRequest('Rule type cannot be changed; duplicate instead', 'RULE_TYPE_IMMUTABLE');
  }
  if (patch.priority !== undefined) doc.priority = patch.priority;
  if (patch.effectiveFrom !== undefined) doc.effectiveFrom = new Date(patch.effectiveFrom);
  if (patch.effectiveTo !== undefined) doc.effectiveTo = new Date(patch.effectiveTo);
  if (patch.conditions !== undefined) doc.conditions = patch.conditions;
  if (patch.action !== undefined) doc.action = patch.action;
  doc.version += 1;
  await doc.save();
  return doc;
}