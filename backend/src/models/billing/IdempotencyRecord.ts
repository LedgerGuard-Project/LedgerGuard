import { Schema, type Connection, type Document, type Model } from 'mongoose';
import {
  IDEMPOTENCY_STATUSES,
  type IdempotencyRecord,
  type IdempotencyStatus,
} from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface IdempotencyRecordDocument
  extends Omit<IdempotencyRecord, 'id' | 'createdAt' | 'updatedAt' | 'expiresAt'>,
    Document {
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const idempotencySchema = new Schema<IdempotencyRecordDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    key: { type: String, required: true, trim: true, maxlength: 200 },
    requestHash: { type: String, trim: true, maxlength: 64 },
    status: { type: String, enum: IDEMPOTENCY_STATUSES, default: 'processing' },
    response: { type: Schema.Types.Mixed },
    transactionId: { type: String },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

withJsonTransform(idempotencySchema);

// THE idempotency guarantee: tenant-scoped unique key.
idempotencySchema.index({ tenantId: 1, key: 1 }, { unique: true });
idempotencySchema.index({ tenantId: 1, status: 1 });
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export function buildIdempotencyRecordModel(
  connection: Connection,
): Model<IdempotencyRecordDocument> {
  if (connection.models['IdempotencyRecord']) {
    return connection.models['IdempotencyRecord'] as Model<IdempotencyRecordDocument>;
  }
  return connection.model<IdempotencyRecordDocument>('IdempotencyRecord', idempotencySchema);
}
