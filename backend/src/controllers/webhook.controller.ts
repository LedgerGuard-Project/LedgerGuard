import type { Response } from 'express';
import { AuditAction, WEBHOOK_EVENT_TYPES, type WebhookEventType } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createEndpoint,
  listEndpoints,
  updateEndpoint,
  rotateEndpointSecret,
  listDeliveries,
  retryDelivery,
  testEndpoint,
} from '../services/billing/webhook.service';
import { writeAudit } from '../services/audit.service';

function auditContext(req: AuthenticatedRequest) {
  return {
    tenantId: req.tc!.tenant.tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

export const listWebhooks = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const items = await listEndpoints(req.tc!.models.billing, req.tc!.tenant.tenantId);
  res.json({ success: true, data: { items, availableEvents: WEBHOOK_EVENT_TYPES } });
});

export const createWebhook = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { endpoint, secret } = await createEndpoint(req.tc!.models.billing, req.tc!.tenant.tenantId, {
    url: String(req.body.url ?? ''),
    description: req.body.description ? String(req.body.description) : undefined,
    events: (req.body.events as WebhookEventType[]) ?? [],
    actor: { id: req.authUser!.id, email: req.authUser!.email },
  });
  await writeAudit({
    ...auditContext(req),
    action: AuditAction.WebhookEndpointCreated,
    resource: 'webhook_endpoint',
    resourceId: endpoint.endpointId,
    details: { url: endpoint.url, events: endpoint.events },
  });
  res.status(201).json({ success: true, data: { endpoint, secret } });
});

export const updateWebhook = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const endpoint = await updateEndpoint(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.endpointId,
    {
      url: req.body.url !== undefined ? String(req.body.url) : undefined,
      description: req.body.description !== undefined ? String(req.body.description) : undefined,
      events: (req.body.events as WebhookEventType[]) ?? undefined,
      active: req.body.active !== undefined ? Boolean(req.body.active) : undefined,
    },
  );
  await writeAudit({
    ...auditContext(req),
    action: AuditAction.WebhookEndpointUpdated,
    resource: 'webhook_endpoint',
    resourceId: endpoint.endpointId,
    details: { patch: { active: endpoint.active, events: endpoint.events } },
  });
  res.json({ success: true, data: { endpoint } });
});

export const rotateWebhookSecret = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { secret } = await rotateEndpointSecret(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.endpointId,
  );
  await writeAudit({
    ...auditContext(req),
    action: AuditAction.WebhookSecretRotated,
    resource: 'webhook_endpoint',
    resourceId: req.params.endpointId,
  });
  res.json({ success: true, data: { secret } });
});

export const webhookDeliveries = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const items = await listDeliveries(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.endpointId,
  );
  res.json({ success: true, data: { items } });
});

export const retryWebhookDelivery = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const delivery = await retryDelivery(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.deliveryId,
  );
  await writeAudit({
    ...auditContext(req),
    action: AuditAction.WebhookDeliveryRetried,
    resource: 'webhook_delivery',
    resourceId: delivery.deliveryId,
    details: { endpointId: delivery.endpointId, eventType: delivery.eventType },
  });
  res.json({ success: true, data: { delivery } });
});

export const testWebhook = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const delivery = await testEndpoint(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.endpointId,
  );
  await writeAudit({
    ...auditContext(req),
    action: AuditAction.WebhookTested,
    resource: 'webhook_endpoint',
    resourceId: req.params.endpointId,
    details: { deliveryId: delivery.deliveryId, status: delivery.status },
  });
  res.json({ success: true, data: { delivery } });
});