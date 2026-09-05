import type { Response } from 'express';
import { AuditAction } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createSavedView,
  listSavedViews,
  deleteSavedView,
} from '../services/billing/savedView.service';
import { writeAudit } from '../services/audit.service';

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const entity = req.query.entity ? String(req.query.entity) : undefined;
  const items = await listSavedViews(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.authUser!.id,
    entity,
  );
  res.json({ success: true, data: { items } });
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const doc = await createSavedView(req.tc!.models.billing, tenantId, req.authUser!.id, {
    name: String(req.body.name ?? ''),
    entity: String(req.body.entity ?? ''),
    filters: Array.isArray(req.body.filters) ? req.body.filters : [],
    columns: Array.isArray(req.body.columns) ? req.body.columns : [],
    sort: req.body.sort,
  });
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.SavedViewCreated,
    resource: 'saved_view',
    resourceId: doc.viewId,
    details: { name: doc.name, entity: doc.entity },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(201).json({ success: true, data: { view: doc.toJSON() } });
});

export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const viewId = req.params.viewId;
  await deleteSavedView(req.tc!.models.billing, tenantId, req.authUser!.id, viewId);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.SavedViewDeleted,
    resource: 'saved_view',
    resourceId: viewId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: {} });
});