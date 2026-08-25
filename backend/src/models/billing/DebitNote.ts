import { Schema, type Connection, type Document, type Model } from 'mongoose';
import { NOTE_STATUSES, type DebitNote } from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface DebitNoteDocument
  extends Omit<DebitNote, 'id' | 'createdAt' | 'updatedAt' | 'issuedAt'>,
    Document {
  issuedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const debitNoteSchema = new Schema<DebitNoteDocument>(
  {
    debitNoteId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    invoiceId: { type: String, required: true },
    invoiceNumber: { type: String, trim: true, maxlength: 40 },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, trim: true, maxlength: 120 },
    debitNoteNumber: { type: String, required: true, trim: true, maxlength: 40 },
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

withJsonTransform(debitNoteSchema);

debitNoteSchema.index({ tenantId: 1, debitNoteId: 1 }, { unique: true });
debitNoteSchema.index({ tenantId: 1, debitNoteNumber: 1 }, { unique: true });
debitNoteSchema.index({ tenantId: 1, invoiceId: 1 });
debitNoteSchema.index({ tenantId: 1, status: 1 });

export function buildDebitNoteModel(connection: Connection): Model<DebitNoteDocument> {
  if (connection.models['DebitNote']) {
    return connection.models['DebitNote'] as Model<DebitNoteDocument>;
  }
  return connection.model<DebitNoteDocument>('DebitNote', debitNoteSchema);
}