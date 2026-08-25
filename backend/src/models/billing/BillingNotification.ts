import { Schema, type Connection, type Document, type Model } from 'mongoose';
import {
  BILLING_NOTIFICATION_TYPES,
  type BillingNotification,
  type BillingNotificationType,
} from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface BillingNotificationDocument
  extends Omit<BillingNotification, 'id' | 'createdAt'>, Document {
  createdAt: Date;
  updatedAt?: Date;
}

const notificationSchema = new Schema<BillingNotificationDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: String },
    type: { type: String, enum: BILLING_NOTIFICATION_TYPES, default: 'system' },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, trim: true, maxlength: 500 },
    data: { type: Schema.Types.Mixed },
    read: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

withJsonTransform(notificationSchema);

notificationSchema.index({ tenantId: 1, userId: 1, read: 1 });
notificationSchema.index({ tenantId: 1, createdAt: -1 });

export function buildBillingNotificationModel(
  connection: Connection,
): Model<BillingNotificationDocument> {
  if (connection.models['BillingNotification']) {
    return connection.models['BillingNotification'] as Model<BillingNotificationDocument>;
  }
  return connection.model<BillingNotificationDocument>('BillingNotification', notificationSchema);
}
