import { Schema, type Connection, type Document, type Model } from 'mongoose';
import {
  BILLING_RULE_STATUSES,
  BILLING_RULE_TYPES,
  RULE_CONDITION_OPERATORS,
  type BillingRule,
} from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface BillingRuleDocument
  extends Omit<BillingRule, 'id' | 'createdAt' | 'updatedAt' | 'effectiveFrom' | 'effectiveTo'>,
    Document {
  createdAt: Date;
  updatedAt: Date;
  effectiveFrom: Date;
  effectiveTo?: Date;
}

const ruleConditionSchema = new Schema(
  {
    field: { type: String, required: true, trim: true, maxlength: 40 },
    operator: { type: String, enum: RULE_CONDITION_OPERATORS, required: true },
    value: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { _id: false },
);

const billingRuleSchema = new Schema<BillingRuleDocument>(
  {
    ruleId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    type: { type: String, enum: BILLING_RULE_TYPES, required: true },
    status: { type: String, enum: BILLING_RULE_STATUSES, default: 'active' },
    priority: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    conditions: { type: [ruleConditionSchema], default: [] },
    action: { type: Schema.Types.Mixed, required: true },
    version: { type: Number, required: true, default: 1, min: 1 },
    createdBy: {
      type: new Schema(
        { id: { type: String, required: true }, email: { type: String, required: true } },
        { _id: false },
      ),
      required: true,
    },
  },
  { timestamps: true },
);

withJsonTransform(billingRuleSchema);

billingRuleSchema.index({ tenantId: 1, ruleId: 1 }, { unique: true });
billingRuleSchema.index({ tenantId: 1, status: 1, type: 1 });
billingRuleSchema.index({ tenantId: 1, type: 1, priority: 1 });

export function buildBillingRuleModel(connection: Connection): Model<BillingRuleDocument> {
  if (connection.models['BillingRule']) {
    return connection.models['BillingRule'] as Model<BillingRuleDocument>;
  }
  return connection.model<BillingRuleDocument>('BillingRule', billingRuleSchema);
}