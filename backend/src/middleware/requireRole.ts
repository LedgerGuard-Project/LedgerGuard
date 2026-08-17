import type { NextFunction, Response } from 'express';
import { ROLE_WEIGHT, UserRole } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../types';
import { ApiError } from '../utils/ApiError';

/** True when the requester meets or exceeds the minimum role weight. */
export function meetsMinimum(role: UserRole, minRole: UserRole): boolean {
  return (ROLE_WEIGHT[role] ?? 0) >= ROLE_WEIGHT[minRole];
}

/**
 * Restricts an endpoint to users holding at least the given role.
 * Used after `authenticate` so `req.authUser` is populated.
 */
export function requireRole(minRole: UserRole) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const user = req.authUser;
    if (!user) {
      throw ApiError.unauthorized('Not authenticated', 'UNAUTHENTICATED');
    }
    if (!meetsMinimum(user.role, minRole)) {
      throw ApiError.forbidden('Insufficient permissions', 'INSUFFICIENT_ROLE');
    }
    next();
  };
}

/** Restrict to the given explicit role(s) (exact match). */
export function requireExactRole(roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const user = req.authUser;
    if (!user) {
      throw ApiError.unauthorized('Not authenticated', 'UNAUTHENTICATED');
    }
    if (!roles.includes(user.role)) {
      throw ApiError.forbidden('Insufficient permissions', 'INSUFFICIENT_ROLE');
    }
    next();
  };
}

export { UserRole };