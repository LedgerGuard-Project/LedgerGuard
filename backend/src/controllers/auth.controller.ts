import type { Response } from 'express';
import * as authService from '../services/auth.service';
import { asyncHandler } from '../utils/asyncHandler';
import type { AuthenticatedRequest } from '../types';
import { getTenantUserModel } from '../services/tenant.service';

export const register = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const session = await authService.register(
    {
      companyName: req.body.companyName,
      tenantId: req.body.tenantId,
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      subscriptionPlan: req.body.subscriptionPlan,
    },
    { ip: req.ip, userAgent: req.get('user-agent') },
  );
  res.status(201).json({ success: true, data: session });
});

export const login = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const session = await authService.login(
    {
      email: req.body.email,
      password: req.body.password,
      tenantId: req.body.tenantId,
      companyName: req.body.companyName,
    },
    { ip: req.ip, userAgent: req.get('user-agent') },
  );
  res.json({ success: true, data: session });
});

export const refresh = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const session = await authService.refresh(req.body.refreshToken);
  res.json({ success: true, data: session });
});

export const logout = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await authService.logout(req.body.refreshToken, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { loggedOut: true } });
});

export const me = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenant = req.tc!.tenant;
  const models = await getTenantUserModel(tenant);
  const user = await models.User.findById(req.authUser!.id).select('-passwordHash');
  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' },
    });
  }
  res.json({
    success: true,
    data: {
      user: user.toJSON(),
      tenant: {
        tenantId: tenant.tenantId,
        companyName: tenant.companyName,
        subscriptionPlan: tenant.subscriptionPlan,
        status: tenant.status,
      },
    },
  });
});