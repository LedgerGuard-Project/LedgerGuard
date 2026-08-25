import { Schema, type Connection, type Document, type Model } from 'mongoose';
import type { TaxRate } from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface TaxRateDocument
  extends Omit<TaxRate, 'id' | 'createdAt' | 'updatedAt'>,
    Document {
  createdAt: Date;
  updatedAt: Date;
}

const taxRateSchema = new Schema<TaxRateDocument>(
  {
    taxRateId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, trim: true, maxlength: 40 },
    region: { type: String, trim: true, maxlength: 40 },
    rate: { type: Number, required: true, min: 0, max: 100 },
    inclusive: { type: Boolean, required: true, default: false },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

withJsonTransform(taxRateSchema);

taxRateSchema.index({ tenantId: 1, taxRateId: 1 }, { unique: true });
taxRateSchema.index({ tenantId: 1, active: 1 });

export function buildTaxRateModel(connection: Connection): Model<TaxRateDocument> {
  if (connection.models['TaxRate']) {
    return connection.models['TaxRate'] as Model<TaxRateDocument>;
  }
  return connection.model<TaxRateDocument>('TaxRate', taxRateSchema);
}