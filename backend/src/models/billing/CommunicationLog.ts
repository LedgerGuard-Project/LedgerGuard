import { Schema, type Connection, type Document, type Model } from 'mongoose';
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_EVENTS,
  COMMUNICATION_STATUSES,
  type CommunicationLog,
  type CommunicationRecipient,
} from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface CommunicationLogDocument
  extends Omit<CommunicationLog, 'id' | 'createdAt' | 'updatedAt'>, Document {
  createdAt: Date;
  updatedAt: Date;
}

const recipientSchema = new Schema<CommunicationRecipient>(
  {
    customerId: { type: String, trim: true, maxlength: 80 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    userId: { type: String, trim: true, maxlength: 80 },
  },
  { _id: false },
);

const communicationLogSchema = new Schema<CommunicationLogDocument>(
  {
    communicationId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    event: { type: String, enum: COMMUNICATION_EVENTS, required: true },
    channel: { type: String, enum: COMMUNICATION_CHANNELS, required: true },
    status: { type: String, enum: COMMUNICATION_STATUSES, default: 'queued' },
    template: { type: String, required: true, trim: true, maxlength: 200 },
    recipient: { type: recipientSchema, default: {} },
    subject: { type: String, trim: true, maxlength: 200 },
    content: { type: String, trim: true, maxlength: 10000 },
    providerMessageId: { type: String, trim: true, maxlength: 200 },
    error: { type: String, trim: true, maxlength: 500 },
    attempts: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

withJsonTransform(communicationLogSchema);

communicationLogSchema.index({ tenantId: 1, communicationId: 1 }, { unique: true });
communicationLogSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
communicationLogSchema.index({ tenantId: 1, event: 1 });

export function buildCommunicationLogModel(
  connection: Connection,
): Model<CommunicationLogDocument> {
  if (connection.models['CommunicationLog']) {
    return connection.models['CommunicationLog'] as Model<CommunicationLogDocument>;
  }
  return connection.model<CommunicationLogDocument>('CommunicationLog', communicationLogSchema);
}