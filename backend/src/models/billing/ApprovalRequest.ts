import { Schema, type Connection, type Document, type Model } from 'mongoose';
import {
  APPROVAL_RESOURCE_TYPES,
  APPROVAL_STATUSES,
  PAYMENT_METHODS,
  type ApprovalRequest,
} from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface ApprovalRequestDocument
  extends Omit<ApprovalRequest, 'id' | 'createdAt' | 'updatedAt'>,
    Document {
  createdAt: Date;
  updatedAt: Date;
}

const approvalRequestSchema = new Schema<ApprovalRequestDocument>(
  {
    approvalId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    resourceType: { type: String, enum: APPROVAL_RESOURCE_TYPES, required: true },
    resourceId: { type: String, required: true },
    resourceName: { type: String, trim: true, maxlength: 200 },
    requesterId: { type: String, required: true },
    requesterEmail: { type: String, required: true, lowercase: true, trim: true },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    thresholdMinor: { type: Number, required: true, min: 0 },
    status: { type: String, enum: APPROVAL_STATUSES, default: 'pending' },
    approverId: { type: String },
    approverEmail: { type: String, lowercase: true, trim: true },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
    metadata: { type: Schema.Types.Mixed },
    paymentMethod: { type: String, enum: PAYMENT_METHODS },
  },
  { timestamps: true },
);

withJsonTransform(approvalRequestSchema);

approvalRequestSchema.index({ tenantId: 1, approvalId: 1 }, { unique: true });
approvalRequestSchema.index({ tenantId: 1, status: 1 });
approvalRequestSchema.index({ tenantId: 1, resourceType: 1, resourceId: 1 });

export function buildApprovalRequestModel(
  connection: Connection,
): Model<ApprovalRequestDocument> {
  if (connection.models['ApprovalRequest']) {
    return connection.models['ApprovalRequest'] as Model<ApprovalRequestDocument>;
  }
  return connection.model<ApprovalRequestDocument>('ApprovalRequest', approvalRequestSchema);
}