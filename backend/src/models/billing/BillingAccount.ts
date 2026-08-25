import { Schema, type Connection, type Document, type Model } from 'mongoose';
import type { BillingAccount, BillingAccountStatus } from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface BillingAccountDocument
  extends Omit<BillingAccount, 'id' | 'createdAt' | 'updatedAt' | 'balance'>,
    Document {
  createdAt: Date;
  updatedAt: Date;
}

const accountSchema = new Schema<BillingAccountDocument>(
  {
    accountId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    customerId: { type: String, required: true },
    customerName: { type: String },
    currency: { type: String, required: true, uppercase: true, trim: true },
    /** Integer minor units (e.g. cents). Never used as a float for math. */
    balanceMinor: { type: Number, required: true, default: 0 },
    creditLimitMinor: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: ['active', 'frozen', 'closed'] satisfies BillingAccountStatus[],
      default: 'active',
    },
  },
  { timestamps: true },
);

withJsonTransform(accountSchema);

accountSchema.index({ tenantId: 1, accountId: 1 }, { unique: true });
accountSchema.index({ tenantId: 1, customerId: 1 }, { unique: true });
accountSchema.index({ tenantId: 1, status: 1 });

export function buildBillingAccountModel(
  connection: Connection,
): Model<BillingAccountDocument> {
  if (connection.models['BillingAccount']) {
    return connection.models['BillingAccount'] as Model<BillingAccountDocument>;
  }
  return connection.model<BillingAccountDocument>('BillingAccount', accountSchema);
}
