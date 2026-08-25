import { Schema, type Connection, type Document, type Model } from 'mongoose';
import { NOTE_STATUSES, type CreditNote } from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface CreditNoteDocument
  extends Omit<CreditNote, 'id' | 'createdAt' | 'updatedAt' | 'issuedAt'>,
    Document {
  issuedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const creditNoteSchema = new Schema<CreditNoteDocument>(
  {
    creditNoteId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    invoiceId: { type: String, required: true },
    invoiceNumber: { type: String, trim: true, maxlength: 40 },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, trim: true, maxlength: 120 },
    creditNoteNumber: { type: String, required: true, trim: true, maxlength: 40 },
    status: { type: String, enum: NOTE_STATUSES, default: 'draft' },
    reason: { type: String, trim: true, maxlength: 1000 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    amountMinor: { type: Number, required: true, min: 0 },
    taxRateMinor: { type: Number, min: 0, max: 100 },
    taxAmountMinor: { type: Number, min: 0 },
    totalMinor: { type: Number, required: true, min: 0 },
    issuedAt: { type: Date },
  },
  { timestamps: true },
);

withJsonTransform(creditNoteSchema);

creditNoteSchema.index({ tenantId: 1, creditNoteId: 1 }, { unique: true });
creditNoteSchema.index({ tenantId: 1, creditNoteNumber: 1 }, { unique: true });
creditNoteSchema.index({ tenantId: 1, invoiceId: 1 });
creditNoteSchema.index({ tenantId: 1, status: 1 });

export function buildCreditNoteModel(connection: Connection): Model<CreditNoteDocument> {
  if (connection.models['CreditNote']) {
    return connection.models['CreditNote'] as Model<CreditNoteDocument>;
  }
  return connection.model<CreditNoteDocument>('CreditNote', creditNoteSchema);
}