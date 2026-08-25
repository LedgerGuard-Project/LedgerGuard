import { Schema, type Connection, type Document, type Model } from 'mongoose';
import {
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type LedgerTransaction,
} from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface LedgerTransactionDocument
  extends Omit<LedgerTransaction, 'id' | 'createdAt' | 'updatedAt' | 'amount' | 'completedAt'>,
    Document {
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

const ledgerTransactionSchema = new Schema<LedgerTransactionDocument>(
  {
    transactionId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    customerId: { type: String, required: true },
    accountId: { type: String, required: true },
    invoiceId: { type: String },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    status: { type: String, enum: TRANSACTION_STATUSES, default: 'processing' },
    idempotencyKey: { type: String, trim: true, maxlength: 200 },
    reference: { type: String, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 500 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS },
    failureReason: { type: String, trim: true, maxlength: 500 },
    retryCount: { type: Number, required: true, min: 0, default: 0 },
    lastRetryAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

withJsonTransform(ledgerTransactionSchema);

ledgerTransactionSchema.index({ tenantId: 1, transactionId: 1 }, { unique: true });
// Extra safety net: the same idempotency key can never drive a second transaction.
ledgerTransactionSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
ledgerTransactionSchema.index({ tenantId: 1, createdAt: -1 });
ledgerTransactionSchema.index({ tenantId: 1, status: 1 });
ledgerTransactionSchema.index({ tenantId: 1, customerId: 1 });
ledgerTransactionSchema.index({ tenantId: 1, type: 1 });

export function buildLedgerTransactionModel(
  connection: Connection,
): Model<LedgerTransactionDocument> {
  if (connection.models['LedgerTransaction']) {
    return connection.models['LedgerTransaction'] as Model<LedgerTransactionDocument>;
  }
  return connection.model<LedgerTransactionDocument>('LedgerTransaction', ledgerTransactionSchema);
}
