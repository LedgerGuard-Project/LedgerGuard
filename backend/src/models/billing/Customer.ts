import { Schema, type Connection, type Document, type Model } from 'mongoose';
import type { Customer, CustomerStatus } from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface CustomerDocument
  extends Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>,
    Document {
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<CustomerDocument>(
  {
    customerId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 40 },
    companyName: { type: String, trim: true, maxlength: 200 },
    billingAddress: {
      line1: { type: String, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      country: { type: String, trim: true },
    },
    taxId: { type: String, trim: true, maxlength: 60 },
    status: {
      type: String,
      enum: ['active', 'archived'] satisfies CustomerStatus[],
      default: 'active',
    },
  },
  { timestamps: true },
);

withJsonTransform(customerSchema);

// Compound unique constraints keep every business key tenant-scoped.
customerSchema.index({ tenantId: 1, customerId: 1 }, { unique: true });
customerSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
customerSchema.index({ tenantId: 1, name: 1 });
customerSchema.index({ tenantId: 1, createdAt: -1 });

export function buildCustomerModel(connection: Connection): Model<CustomerDocument> {
  if (connection.models['BillingCustomer']) {
    return connection.models['BillingCustomer'] as Model<CustomerDocument>;
  }
  return connection.model<CustomerDocument>('BillingCustomer', customerSchema);
}
