import type { Response } from 'express';
import { AuditAction } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createTaxRate,
  listTaxRates,
  updateTaxRate,
  setTaxRateActive,
  getTaxRateId,
} from '../../services/billing/tax.service';
import { serializeTaxRate } from '../../services/billing/serializers';
import { writeAudit } from '../../services/audit.service';

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const rate = await createTaxRate(models, tenantId, req.body);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.TaxRateCreated,
    resource: 'tax_rate',
    resourceId: rate.taxRateId,
    details: { name: rate.name, rate: rate.rate, inclusive: rate.inclusive },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(201).json({ success: true, data: { taxRate: serializeTaxRate(rate) } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const includeInactive = req.query.includeInactive !== 'false';
  const rates = await listTaxRates(req.tc!.models.billing, req.tc!.tenant.tenantId, includeInactive);
  res.json({ success: true, data: { items: rates.map((r) => serializeTaxRate(r)) } });
});

export const detail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rate = await getTaxRateId(req.tc!.models.billing, req.tc!.tenant.tenantId, req.params.taxRateId);
  res.json({ success: true, data: { taxRate: serializeTaxRate(rate) } });
});

export const patch = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const rate = await updateTaxRate(models, tenantId, req.params.taxRateId, req.body);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.TaxRateUpdated,
    resource: 'tax_rate',
    resourceId: rate.taxRateId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { taxRate: serializeTaxRate(rate) } });
});

export const activate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const active = Boolean(req.body.active);
  const rate = await setTaxRateActive(models, tenantId, req.params.taxRateId, active);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: active ? AuditAction.TaxRateCreated : AuditAction.TaxRateDeactivated,
    resource: 'tax_rate',
    resourceId: rate.taxRateId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { taxRate: serializeTaxRate(rate) } });
});