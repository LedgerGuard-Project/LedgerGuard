import type { ObjectId } from './primitives';

/** Supported billing rule strategies (server-side invoice calculation). */
export const BILLING_RULE_TYPES = [
  'discount',
  'tax_override',
  'minimum_charge',
  'maximum_charge',
  'grace_period',
  'late_fee',
] as const;
export type BillingRuleType = (typeof BILLING_RULE_TYPES)[number];

export const BILLING_RULE_STATUSES = ['active', 'disabled'] as const;
export type BillingRuleStatus = (typeof BILLING_RULE_STATUSES)[number];

/** Comparison operators used in rule conditions. */
export const RULE_CONDITION_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'] as const;
export type RuleConditionOperator = (typeof RULE_CONDITION_OPERATORS)[number];

export interface BillingRuleCondition {
  /** Field on the invoice context: 'customerId' | 'currency' | 'subtotalMinor'. */
  field: string;
  operator: RuleConditionOperator;
  /** Stored as a string; numeric comparison is applied at evaluation time. */
  value: string;
}

/**
 * Evaluation outcome of a single rule. Stored on the created invoice so the
 * calculation is transparent and re-runnable (full audit trail of rules).
 */
export interface BillingRuleEffect {
  ruleId: string;
  name: string;
  version: number;
  type: BillingRuleType;
  /** Human readable description of what the rule changed. */
  applied: string;
  /** Positive minor-unit delta added to the total (negative removes). */
  deltaMinor?: number;
}

/**
 * A tenant-scoped billing rule. Rules with the same type are applied in
 * priority order (lower number wins) and conflicting definitions are rejected
 * at creation time.
 */
export interface BillingRule {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "RUL-ab12cd34". */
  ruleId: string;
  tenantId: string;
  name: string;
  type: BillingRuleType;
  status: BillingRuleStatus;
  /** Lower = evaluated first. Rules for the same type must have unique priority. */
  priority: number;
  /** Real date the rule becomes (or became) effective. */
  effectiveFrom: string;
  effectiveTo?: string;
  conditions: BillingRuleCondition[];
  /** Type-specific action payload (e.g. { percent: 10 } for discount). */
  action: Record<string, string | number | boolean>;
  /** Monotonic version bumped on each edit (conflicts detected on duplicates). */
  version: number;
  createdBy: { id: string; email: string };
  createdAt: string;
  updatedAt: string;
}