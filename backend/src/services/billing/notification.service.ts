import type { BillingNotificationType } from '@ledgerguard/shared';
import { SOCKET_EVENTS } from '@ledgerguard/shared';
import type { BillingNotificationDocument } from '../../models/billing/BillingNotification';
import type { BillingModels } from '../../models/billing';
import { emitTenantEvent } from '../../sockets/eventBus';

export interface NotificationInput {
  userId?: string;
  type: BillingNotificationType;
  title: string;
  message?: string;
  data?: Record<string, unknown>;
}

export async function createNotification(
  models: BillingModels,
  tenantId: string,
  input: NotificationInput,
): Promise<BillingNotificationDocument> {
  const doc = await models.Notification.create({ tenantId, ...input, read: false });
  // Realtime fan-out: notified clients update the notification center instantly.
  emitTenantEvent(tenantId, SOCKET_EVENTS.notificationCreated, {
    notification: doc.toJSON(),
  });
  emitTenantEvent(tenantId, SOCKET_EVENTS.notification, {
    notification: doc.toJSON(),
  });
  return doc;
}

export async function listNotifications(
  models: BillingModels,
  tenantId: string,
  userId?: string,
  limit = 50,
): Promise<BillingNotificationDocument[]> {
  const filter: Record<string, unknown> = { tenantId };
  if (userId) filter.userId = userId;
  return models.Notification.find(filter).sort({ createdAt: -1 }).limit(limit);
}

export async function countUnread(
  models: BillingModels,
  tenantId: string,
  userId?: string,
): Promise<number> {
  const filter: Record<string, unknown> = { tenantId, read: false };
  if (userId) filter.userId = userId;
  return models.Notification.countDocuments(filter);
}

export async function markRead(
  models: BillingModels,
  tenantId: string,
  notificationId: string,
): Promise<BillingNotificationDocument> {
  const doc = await models.Notification.findOneAndUpdate(
    { tenantId, _id: notificationId },
    { $set: { read: true } },
    { new: true },
  );
  if (!doc) {
    const reason = `notification ${notificationId} not found`;
    throw new Error(reason);
  }
  return doc;
}

export async function markAllRead(
  models: BillingModels,
  tenantId: string,
  userId?: string,
): Promise<number> {
  const filter: Record<string, unknown> = { tenantId };
  if (userId) filter.userId = userId;
  const result = await models.Notification.updateMany(filter, { $set: { read: true } });
  return result.modifiedCount ?? 0;
}
