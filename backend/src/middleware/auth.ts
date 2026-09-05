import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../types';
import { verifyAccessToken } from '../security/jwt';
import { getTenantBySlug } from '../services/tenant.service';
import { tenantConnectionManager } from '../database';
import { ApiError } from '../utils/ApiError';
import { looksLikeApiKey } from '../utils/apiKeyCrypto';
import { findUsableApiKey, effectiveRoleFor } from '../services/apiKey.service';
import type { ApiKeyPermission } from '@ledgerguard/shared';

/**
 * Multi-tenant auth + tenant resolver.
 *
 * Flow: decode JWT (or resolve API key) -> resolve tenant -> open/attach the
 * tenant's dedicated DB connection + models -> load the tenant-scoped user ->
 * attach context.
 */
export async function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing bearer token', 'TOKEN_REQUIRED');
    }
    const token = header.slice('Bearer '.length).trim();

    // ---- API key path (lgk_... keys never look like JWTs) ----
    if (looksLikeApiKey(token)) {
      const key = await findUsableApiKey(token);
      if (!key) {
        throw ApiError.unauthorized('API key is invalid, expired, or revoked', 'INVALID_API_KEY');
      }
      const tenant = await getTenantBySlug(key.tenantId);
      if (tenant.status === 'canceled') {
        throw ApiError.unauthorized('This organization is no longer active', 'ORG_SUSPENDED');
      }
      const connection = await tenantConnectionManager.connectTenant(
        tenant.tenantId,
        tenant.databaseConnection,
      );
      const models =
        tenantConnectionManager.getModels(tenant.tenantId) ??
        (await import('../database/models.factory')).createTenantModels(connection);

      req.tc = { tenant, connection, models };
      req.authUser = {
        id: key.keyId,
        name: `API key: ${key.name}`,
        email: `api-key+${key.keyId}@${tenant.tenantId}`,
        role: effectiveRoleFor(key.permissions as ApiKeyPermission[]),
        status: 'active',
        tenantId: tenant.tenantId,
      };
      req.accessToken = token;
      next();
      return;
    }

    // ---- JWT path ----
    const payload = verifyAccessToken(token);

    const tenant = await getTenantBySlug(payload.tenantId);
    if (tenant.status === 'canceled') {
      throw ApiError.unauthorized('This organization is no longer active', 'ORG_SUSPENDED');
    }

    const connection = await tenantConnectionManager.connectTenant(
      tenant.tenantId,
      tenant.databaseConnection,
    );
    const models =
      tenantConnectionManager.getModels(tenant.tenantId) ??
      (await import('../database/models.factory')).createTenantModels(connection);

    const user = await models.User.findById(payload.sub);
    if (!user || user.status !== 'active') {
      throw ApiError.unauthorized('User not found or inactive', 'USER_UNAVAILABLE');
    }

    req.tc = { tenant, connection, models };
    req.authUser = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      tenantId: tenant.tenantId,
    };
    req.accessToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

/** Resolve the user for an already-established tenant context (used by 'me'). */
export async function resolveUser(req: AuthenticatedRequest) {
  const user = await req.tc!.models.User.findById(req.authUser!.id).select('-passwordHash');
  if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  return user;
}