import type { Response } from 'express';
import { AuditAction, EXCEPTION_STATUSES, EXCEPTION_TYPES, EXCEPTION_SEVERITIES } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import { parsePagination } from '../../utils/pagination';
import {
  createException,
  listExceptions,
  getException,
  assignException,
  investigateException,
  resolveException,
  reopenException,
  serialize,
} from '../../services/billing/exception.service';
import { writeAudit } from '../../services/audit.service';

function actor(req: AuthenticatedRequest): { id: string; email: string } {
  return { id: req.authUser!.id, email: req.authUser!.email };
}

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);
  const status = EXCEPTION_STATUSES.includes(req.query.status as never)
    ? (req.query.status as (typeof EXCEPTION_STATUSES)[number])
    : undefined;
  const type = EXCEPTION_TYPES.includes(req.query.type as never)
    ? (req.query.type as (typeof EXCEPTION_TYPES)[number])
    : undefined;
  const severity = EXCEPTION_SEVERITIES.includes(req.query.severity as never)
    ? (req.query.severity as (typeof EXCEPTION_SEVERITIES)[number])
    : undefined;
  const mine = req.query.mine === 'true';

  const { items, total } = await listExceptions(req.tc!.models.billing, req.tc!.tenant.tenantId, {
    status,
    type,
    severity,
    assignedToMe: mine ? req.authUser!.id : undefined,
    page,
    perPage,
    skip,
  });
  res.json({ success: true, data: { items, total, page, perPage } });
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const doc = await createException(req.tc!.models.billing, tenantId, req.body);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.ExceptionCreated,
    resource: 'exception',
    resourceId: doc.exceptionId,
    details: { type: doc.type, severity: doc.severity, amountMinor: doc.amountMinor },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(201).json({ success: true, data: { exception: serialize(doc) } });
});

export const detail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const doc = await getException(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.exceptionId,
  );
  res.json({ success: true, data: { exception: serialize(doc) } });
});

export const assign = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const doc = await assignException(
    req.tc!.models.billing,
    tenantId,
    req.params.exceptionId,
    actor(req), // self-assign; reassignment also uses this endpoint
  );
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.ExceptionAssigned,
    resource: 'exception',
    resourceId: doc.exceptionId,
    details: { assignedTo: doc.assignedTo },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { exception: serialize(doc) } });
});

export const investigate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const doc = await investigateException(req.tc!.models.billing, tenantId, req.params.exceptionId);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.ExceptionInvestigating,
    resource: 'exception',
    resourceId: doc.exceptionId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { exception: serialize(doc) } });
});

export const resolve = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const ignore = req.body.ignore === true;
  const doc = await resolveException(
    req.tc!.models.billing,
    tenantId,
    req.params.exceptionId,
    actor(req),
    String(req.body.resolution ?? ''),
    ignore,
  );
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.ExceptionResolved,
    resource: 'exception',
    resourceId: doc.exceptionId,
    details: { status: doc.status, resolution: doc.resolution },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { exception: serialize(doc) } });
});

export const reopen = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const doc = await reopenException(
    req.tc!.models.billing,
    tenantId,
    req.params.exceptionId,
    String(req.body.reason ?? ''),
  );
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.ExceptionReopened,
    resource: 'exception',
    resourceId: doc.exceptionId,
    details: { reason: req.body.reason },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { exception: serialize(doc) } });
});