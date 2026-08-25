import { Schema, type Connection, type Document, type Model } from 'mongoose';
import { FINANCIAL_PERIOD_STATUSES, type FinancialPeriod } from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface FinancialPeriodDocument
  extends Omit<
      FinancialPeriod,
      'id' | 'createdAt' | 'updatedAt' | 'closedAt' | 'reopenedAt'
    >,
    Document {
  closedAt?: Date;
  reopenedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const financialPeriodSchema = new Schema<FinancialPeriodDocument>(
  {
    periodId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    status: { type: String, enum: FINANCIAL_PERIOD_STATUSES, default: 'open' },
    closedBy: { type: String, trim: true },
    closedAt: { type: Date },
    reopenedBy: { type: String, trim: true },
    reopenedAt: { type: Date },
  },
  { timestamps: true },
);

withJsonTransform(financialPeriodSchema);

financialPeriodSchema.index({ tenantId: 1, periodId: 1 }, { unique: true });
financialPeriodSchema.index({ tenantId: 1, status: 1 });

export function buildFinancialPeriodModel(
  connection: Connection,
): Model<FinancialPeriodDocument> {
  if (connection.models['FinancialPeriod']) {
    return connection.models['FinancialPeriod'] as Model<FinancialPeriodDocument>;
  }
  return connection.model<FinancialPeriodDocument>('FinancialPeriod', financialPeriodSchema);
}