import { Schema, type Connection, type Document, type Model } from 'mongoose';
import {
  LEDGER_DIRECTIONS,
  LEDGER_ENTRY_TYPES,
  type LedgerEntry,
} from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface LedgerEntryDocument
  extends Omit<LedgerEntry, 'id' | 'createdAt'>, Document {
  createdAt: Date;
  updatedAt?: Date;
}

const ledgerEntrySchema = new Schema<LedgerEntryDocument>(
  {
    entryId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    transactionId: { type: String, required: true, index: true },
    accountId: { type: String, required: true },
    entryType: { type: String, enum: LEDGER_ENTRY_TYPES, required: true },
    /** Integer minor units. Always positive; direction carries the sign. */
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    direction: { type: String, enum: LEDGER_DIRECTIONS, required: true },
    description: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

withJsonTransform(ledgerEntrySchema);

ledgerEntrySchema.index({ tenantId: 1, entryId: 1 }, { unique: true });
ledgerEntrySchema.index({ tenantId: 1, transactionId: 1 });
ledgerEntrySchema.index({ tenantId: 1, accountId: 1 });
ledgerEntrySchema.index({ tenantId: 1, createdAt: -1 });

export function buildLedgerEntryModel(connection: Connection): Model<LedgerEntryDocument> {
  if (connection.models['LedgerEntry']) {
    return connection.models['LedgerEntry'] as Model<LedgerEntryDocument>;
  }
  return connection.model<LedgerEntryDocument>('LedgerEntry', ledgerEntrySchema);
}
