import type { Response } from 'express';
import { AuditAction, SOCKET_EVENTS } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createPeriod,
  listPeriods,
  getPeriod,
  closePeriod,
  reopenPeriod,
  updatePeriod,
} from '../../services/billing/financialPeriod.service';
import { serializePeriod } from '../../services/billing/serializers';
import { writeAudit } from '../../services/audit.service';
import { emitTenantEvent } from '../../sockets/eventBus';
import { createNotification } from '../../services/billing/notification.service';

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const period = await createPeriod(models, tenantId, req.body);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.FinancialPeriodCreated,
    resource: 'financial_period',
    resourceId: period.periodId,
    details: { name: period.name },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(201).json({ success: true, data: { period: serializePeriod(period) } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const periods = await listPeriods(req.tc!.models.billing, req.tc!.tenant.tenantId);
  res.json({ success: true, data: { items: periods.map((p) => serializePeriod(p)) } });
});

export const detail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const period = await getPeriod(req.tc!.models.billing, req.tc!.tenant.tenantId, req.params.periodId);
  res.json({ success: true, data: { period: serializePeriod(period) } });
});

export const patch = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const period = await updatePeriod(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.periodId,
    req.body,
  );
  res.json({ success: true, data: { period: serializePeriod(period) } });
});

export const close = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const period = await closePeriod(models, tenantId, req.params.periodId, {
    id: req.authUser!.id,
    email: req.authUser!.email,
  });
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.FinancialPeriodClosed,
    resource: 'financial_period',
    resourceId: period.periodId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  await createNotification(models, tenantId, {
    type: 'period',
    title: 'Financial period closed',
    message: `${period.name} (${period.startDate} to ${period.endDate}) is now closed`,
    data: { periodId: period.periodId },
  });
  emitTenantEvent(tenantId, SOCKET_EVENTS.financialPeriodClosed, { periodId: period.periodId });
  res.json({ success: true, data: { period: serializePeriod(period) } });
});

export const reopen = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const period = await reopenPeriod(models, tenantId, req.params.periodId, {
    id: req.authUser!.id,
    email: req.authUser!.email,
  });
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.FinancialPeriodReopened,
    resource: 'financial_period',
    resourceId: period.periodId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  await createNotification(models, tenantId, {
    type: 'period',
    title: 'Financial period reopened',
    message: `${period.name} was reopened`,
    data: { periodId: period.periodId },
  });
  emitTenantEvent(tenantId, SOCKET_EVENTS.financialPeriodReopened, { periodId: period.periodId });
  res.json({ success: true, data: { period: serializePeriod(period) } });
});