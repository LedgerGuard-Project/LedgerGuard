import { Schema, type Connection, type Document, type Model } from 'mongoose';
import {
  BANK_MATCH_CONFIDENCE,
  BANK_TRANSACTION_STATUSES,
  type BankTransaction,
  type BankTransactionStatus,
} from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface BankTransactionDocument
  extends Omit<BankTransaction, 'id' | 'createdAt' | 'updatedAt' | 'importedAt' | 'transactionDate'>,
    Document {
  importedAt: Date;
  transactionDate: Date;
  createdAt: Date;
  updatedAt?: Date;
}

const bankTransactionSchema = new Schema<BankTransactionDocument>(
  {
    bankTransactionId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    batchId: { type: String, required: true, trim: true, index: true },
    externalReference: { type: String, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 500 },
    amountMinor: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    transactionDate: { type: Date, required: true },
    ledgerTransactionId: { type: String },
    status: { type: String, enum: BANK_TRANSACTION_STATUSES, default: 'unmatched' },
    matchConfidence: { type: String, enum: BANK_MATCH_CONFIDENCE },
    notes: { type: String, trim: true, maxlength: 1000 },
    importedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

withJsonTransform(bankTransactionSchema);

bankTransactionSchema.index({ tenantId: 1, bankTransactionId: 1 }, { unique: true });
bankTransactionSchema.index({ tenantId: 1, status: 1 });
bankTransactionSchema.index({ tenantId: 1, ledgerTransactionId: 1 }, { sparse: true });
bankTransactionSchema.index({ tenantId: 1, batchId: 1, createdAt: -1 });

export function buildBankTransactionModel(connection: Connection): Model<BankTransactionDocument> {
  if (connection.models['BankTransaction']) {
    return connection.models['BankTransaction'] as Model<BankTransactionDocument>;
  }
  return connection.model<BankTransactionDocument>('BankTransaction', bankTransactionSchema);
}