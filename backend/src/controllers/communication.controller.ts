import type { Response } from 'express';
import { AuditAction, COMMUNICATION_EVENTS } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createCommunication,
  listCommunications,
  getCommunication,
  retryCommunication,
} from '../services/billing/communication.service';
import { writeAudit } from '../services/audit.service';

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const items = await listCommunications(req.tc!.models.billing, req.tc!.tenant.tenantId);
  res.json({ success: true, data: { items, events: COMMUNICATION_EVENTS } });
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const doc = await createCommunication(req.tc!.models.billing, tenantId, {
    event: req.body.event,
    channel: req.body.channel,
    template: String(req.body.template ?? req.body.event),
    recipient: req.body.recipient ?? {},
    vars: req.body.vars ?? {},
  });
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.CommunicationCreated,
    resource: 'communication',
    resourceId: doc.communicationId,
    details: { event: doc.event, channel: doc.channel, status: doc.status },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(201).json({ success: true, data: { communication: doc.toJSON() } });
});

export const detail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const doc = await getCommunication(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.communicationId,
  );
  res.json({ success: true, data: { communication: doc.toJSON() } });
});

export const retry = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const doc = await retryCommunication(
    req.tc!.models.billing,
    tenantId,
    req.params.communicationId,
  );
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.CommunicationRetried,
    resource: 'communication',
    resourceId: doc.communicationId,
    details: { status: doc.status },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { communication: doc.toJSON() } });
});