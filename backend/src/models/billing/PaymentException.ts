import { Schema, type Connection, type Document, type Model } from 'mongoose';
import {
  EXCEPTION_SEVERITIES,
  EXCEPTION_STATUSES,
  EXCEPTION_TYPES,
  type PaymentException,
} from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface PaymentExceptionDocument
  extends Omit<PaymentException, 'id' | 'createdAt' | 'updatedAt' | 'resolvedAt' | 'dueAt'>,
    Document {
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  dueAt?: Date;
}

const actorSchema = new Schema(
  { id: { type: String, required: true }, email: { type: String, required: true } },
  { _id: false },
);

const paymentExceptionSchema = new Schema<PaymentExceptionDocument>(
  {
    exceptionId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    type: { type: String, enum: EXCEPTION_TYPES, required: true },
    severity: { type: String, enum: EXCEPTION_SEVERITIES, default: 'medium' },
    status: { type: String, enum: EXCEPTION_STATUSES, default: 'open' },
    paymentId: { type: String, trim: true },
    invoiceId: { type: String, trim: true },
    customerId: { type: String, trim: true },
    bankTransactionId: { type: String, trim: true },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    assignedTo: actorSchema,
    resolvedBy: actorSchema,
    resolution: { type: String, trim: true, maxlength: 2000 },
    resolvedAt: { type: Date },
    dueAt: { type: Date },
  },
  { timestamps: true },
);

withJsonTransform(paymentExceptionSchema);

paymentExceptionSchema.index({ tenantId: 1, exceptionId: 1 }, { unique: true });
paymentExceptionSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
paymentExceptionSchema.index({ tenantId: 1, type: 1 });
paymentExceptionSchema.index({ tenantId: 1, 'assignedTo.id': 1 });

export function buildPaymentExceptionModel(
  connection: Connection,
): Model<PaymentExceptionDocument> {
  if (connection.models['PaymentException']) {
    return connection.models['PaymentException'] as Model<PaymentExceptionDocument>;
  }
  return connection.model<PaymentExceptionDocument>('PaymentException', paymentExceptionSchema);
}