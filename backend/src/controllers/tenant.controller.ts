import { AuditAction, type SubscriptionPlan } from '@ledgerguard/shared';
import type { Response } from 'express';
import * as tenantService from '../services/tenant.service';
import { writeAudit } from '../services/audit.service';
import { asyncHandler } from '../utils/asyncHandler';
import { tenantConnectionManager } from '../database';
import type { AuthenticatedRequest } from '../types';

/** Returns the authenticated user's own tenant. */
export const me = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: { tenant: req.tc!.tenant.toJSON() },
  });
});

/** Super admin: list all tenants across the platform. */
export const listTenants = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenants = await tenantService.listTenants();
  res.json({ success: true, data: { tenants } });
});

/** Super admin: manually provision a tenant. */
export const createTenant = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await tenantService.provisionTenant({
    tenantId: req.body.tenantId,
    companyName: req.body.companyName,
    ownerName: req.body.ownerName,
    ownerEmail: req.body.ownerEmail,
    ownerPassword: req.body.ownerPassword,
    subscriptionPlan: req.body.subscriptionPlan ?? 'free',
  });

  await writeAudit({
    tenantId: result.tenant.tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.TenantCreated,
    resource: 'tenant',
    resourceId: result.tenant.tenantId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(201).json({ success: true, data: { tenant: result.tenant } });
});

/** Super admin: update subscription plan / status. */
export const updateTenant = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const patch: { subscriptionPlan?: SubscriptionPlan; status?: string } = {};
  if (req.body.subscriptionPlan) patch.subscriptionPlan = req.body.subscriptionPlan;
  if (req.body.status) patch.status = req.body.status;
  const tenant = await tenantService.updateTenant(req.params.id, patch);

  await writeAudit({
    tenantId: tenant.tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.TenantUpdated,
    resource: 'tenant',
    resourceId: tenant.tenantId,
    details: patch,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ success: true, data: { tenant } });
});

/** Super admin: disconnect a tenant's database connection. */
export const disconnectTenant = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenant = await tenantService.getTenantBySlug(req.params.id);
  await tenantConnectionManager.disconnectTenant(tenant.tenantId);
  res.json({ success: true, data: { disconnected: true } });
});

/** Connection pool diagnostics (super admin). */
export const poolStatus = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, data: { pool: tenantConnectionManager.connectionPool() } });
});