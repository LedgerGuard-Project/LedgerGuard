import type { Response } from 'express';
import { AuditAction } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  listNotifications,
  countUnread,
  markRead,
  markAllRead,
} from '../../services/billing/notification.service';
import { writeAudit } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const userId = req.authUser!.id;
  const [notifications, unread] = await Promise.all([
    listNotifications(models, tenantId, userId, 50),
    countUnread(models, tenantId, userId),
  ]);
  res.json({ success: true, data: { notifications, unread } });
});

export const markOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const notification = await markRead(models, tenantId, req.params.notificationId).catch((err) => {
    throw new ApiError(
      err instanceof Error ? err.message : 'Notification not found',
      404,
      'NOTIFICATION_NOT_FOUND',
    );
  });
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.NotificationRead,
    resource: 'notification',
    resourceId: String(notification._id),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { notification: notification.toJSON() } });
});

export const markAll = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const updated = await markAllRead(models, tenantId, req.authUser!.id);
  res.json({ success: true, data: { updated } });
});