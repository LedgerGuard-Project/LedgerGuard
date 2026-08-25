import { Schema, type Connection, type Document, type Model } from 'mongoose';
import {
  RECURRING_INTERVALS,
  RECURRING_STATUSES,
  RECURRING_INVOICE_STATUSES,
  PAYMENT_METHODS,
  type RecurringPlan,
} from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface RecurringPlanDocument
  extends Omit<RecurringPlan, 'id' | 'createdAt' | 'updatedAt'>,
    Document {
  createdAt: Date;
  updatedAt: Date;
}

const recurringPlanSchema = new Schema<RecurringPlanDocument>(
  {
    planId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000 },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    interval: { type: String, enum: RECURRING_INTERVALS, required: true },
    intervalCount: { type: Number, required: true, min: 1, default: 1 },
    startDate: { type: String, required: true },
    nextBillingDate: { type: String, required: true },
    endDate: { type: String },
    status: { type: String, enum: RECURRING_STATUSES, default: 'active' },
    invoiceStatus: { type: String, enum: RECURRING_INVOICE_STATUSES, default: 'draft' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS },
    autoGenerate: { type: Boolean, required: true, default: true },
    lastGeneratedAt: { type: String },
  },
  { timestamps: true },
);

withJsonTransform(recurringPlanSchema);

recurringPlanSchema.index({ tenantId: 1, planId: 1 }, { unique: true });
recurringPlanSchema.index({ tenantId: 1, status: 1 });
recurringPlanSchema.index({ tenantId: 1, nextBillingDate: 1 });

export function buildRecurringPlanModel(
  connection: Connection,
): Model<RecurringPlanDocument> {
  if (connection.models['RecurringPlan']) {
    return connection.models['RecurringPlan'] as Model<RecurringPlanDocument>;
  }
  return connection.model<RecurringPlanDocument>('RecurringPlan', recurringPlanSchema);
}