import { AuditAction, UserRole } from '@ledgerguard/shared';
import type { Response } from 'express';
import * as userService from '../services/user.service';
import { writeAudit } from '../services/audit.service';
import { asyncHandler } from '../utils/asyncHandler';
import type { AuthenticatedRequest } from '../types';

export const listUsers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const users = await userService.listUsers(req.tc!.models);
  res.json({ success: true, data: { users } });
});

export const createUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await userService.createUser(
    req.tc!.models,
    req.tc!.tenant,
    req.authUser!,
    {
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      role: req.body.role,
    },
  );

  await writeAudit({
    tenantId: req.tc!.tenant.tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.UserCreated,
    resource: 'user',
    resourceId: String(user._id),
    details: { role: user.role },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(201).json({ success: true, data: { user: user.toJSON() } });
});

export const updateRole = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const role = req.body.role as UserRole;
  const user = await userService.updateRole(req.tc!.models, req.authUser!, req.params.id, role);

  await writeAudit({
    tenantId: req.tc!.tenant.tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.PermissionChanged,
    resource: 'user',
    resourceId: String(user._id),
    details: { toRole: role },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ success: true, data: { user: user.toJSON() } });
});

export const updateStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const status = req.body.status as 'active' | 'disabled';
  const user = await userService.updateStatus(req.tc!.models, req.authUser!, req.params.id, status);

  await writeAudit({
    tenantId: req.tc!.tenant.tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.UserStatusChanged,
    resource: 'user',
    resourceId: String(user._id),
    details: { status },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ success: true, data: { user: user.toJSON() } });
});