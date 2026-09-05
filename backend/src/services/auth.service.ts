import { AuditAction, UserRole, type SubscriptionPlan } from '@ledgerguard/shared';
import { ApiError } from '../utils/ApiError';
import { verifyPassword } from '../security/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
  isRefreshTokenStored,
  newJti,
} from '../security/jwt';
import { writeAudit } from './audit.service';
import {
  provisionTenant,
  getTenantBySlug,
  getTenantByCompany,
  getTenantUserModel,
} from './tenant.service';
import {
  isAccountLocked,
  recordFailedLogin,
  clearFailedLogins,
} from '../middleware/authRateLimit';
import type { TenantDocument } from '../models/Tenant';
import type { TenantUserDocument } from '../database/models.factory';
import { logger } from '../utils/logger';

export interface RegisterInput {
  companyName: string;
  tenantId?: string;
  name: string;
  email: string;
  password: string;
  subscriptionPlan?: SubscriptionPlan;
}

export interface LoginInput {
  email: string;
  password: string;
  tenantId?: string;
  companyName?: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
  tenant: {
    tenantId: string;
    companyName: string;
    subscriptionPlan: string;
  };
}

export async function register(
  input: RegisterInput,
  meta: { ip?: string; userAgent?: string },
): Promise<Session> {
  if (input.password.length < 8) {
    throw ApiError.badRequest('Password must be at least 8 characters', 'WEAK_PASSWORD');
  }
  const slug = input.tenantId?.trim() || slugFromCompany(input.companyName);

  const { tenant } = await provisionTenant({
    tenantId: slug,
    companyName: input.companyName,
    ownerName: input.name,
    ownerEmail: input.email,
    ownerPassword: input.password,
    subscriptionPlan: input.subscriptionPlan ?? 'free',
  });

  const models = await getTenantUserModel(tenant);
  const user = await models.User.findOne({ email: input.email.toLowerCase() });
  if (!user) {
    throw ApiError.badRequest('Owner account could not be created', 'PROVISION_FAILED');
  }

  const session = await issueSession(tenant, user);
  await writeAudit({
    tenantId: tenant.tenantId,
    actorId: String(user._id),
    actorEmail: user.email,
    action: AuditAction.Register,
    resource: 'auth',
    resourceId: 'register',
    details: { company: tenant.companyName },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return session;
}

export async function login(
  input: LoginInput,
  meta: { ip?: string; userAgent?: string },
): Promise<Session> {
  let tenant: TenantDocument;
  if (input.tenantId) {
    tenant = await getTenantBySlug(input.tenantId);
  } else if (input.companyName) {
    tenant = await getTenantByCompany(input.companyName);
  } else {
    throw ApiError.badRequest('tenantId or companyName is required to sign in', 'TENANT_REQUIRED');
  }

  if (tenant.status === 'canceled') {
    throw ApiError.forbidden('This organization is no longer active', 'ORG_SUSPENDED');
  }

  // Progressive-delay / soft lockout (degrades gracefully without Redis).
  // The same generic error is thrown whether locked or not — no account
  // enumeration.
  const locked = await isAccountLocked(tenant.tenantId, input.email);
  if (locked) {
    logger.warn('Login blocked by lockout', {
      tenantId: tenant.tenantId,
      email: input.email,
      ip: meta.ip,
    });
    throw ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const models = await getTenantUserModel(tenant);
  const user = await models.User.findOne({ email: input.email.toLowerCase() });
  if (!user) {
    await recordFailedLogin(tenant.tenantId, input.email);
    throw ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
  }
  if (user.status === 'disabled') {
    throw ApiError.forbidden('This account has been disabled', 'USER_DISABLED');
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    await recordFailedLogin(tenant.tenantId, input.email);
    throw ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  // Successful authentication — clear any prior lockout state.
  await clearFailedLogins(tenant.tenantId, input.email);

  user.lastLoginAt = new Date().toISOString();
  await user.save();

  const session = await issueSession(tenant, user);
  await writeAudit({
    tenantId: tenant.tenantId,
    actorId: String(user._id),
    actorEmail: user.email,
    action: AuditAction.Login,
    resource: 'auth',
    resourceId: 'login',
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return session;
}

export async function refresh(token: string): Promise<Session> {
  const payload = verifyRefreshToken(token);
  if (!(await isRefreshTokenStored(payload.tenantId, payload.sub, payload.jti))) {
    throw ApiError.unauthorized('Refresh token revoked', 'REFRESH_REVOKED');
  }

  const tenant = await getTenantBySlug(payload.tenantId);
  const models = await getTenantUserModel(tenant);
  const user = await models.User.findById(payload.sub);
  if (!user || user.status !== 'active') {
    throw ApiError.unauthorized('User unavailable', 'USER_UNAVAILABLE');
  }

  await revokeRefreshToken(payload.tenantId, payload.sub, payload.jti);
  const session = await issueSession(tenant, user);
  return session;
}

export async function logout(refreshToken: string, meta: { ip?: string; userAgent?: string }) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await revokeRefreshToken(payload.tenantId, payload.sub, payload.jti);
    await writeAudit({
      tenantId: payload.tenantId,
      actorId: payload.sub,
      action: AuditAction.Logout,
      resource: 'auth',
      resourceId: 'logout',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  } catch (err) {
    logger.warn('logout: refresh token already invalid', { err });
  }
}

async function issueSession(
  tenant: TenantDocument,
  user: TenantUserDocument,
): Promise<Session> {
  const userJson = user.toJSON() as Record<string, unknown>;
  const accessToken = signAccessToken({
    userId: String(user._id),
    email: user.email,
    role: user.role,
    tenantId: tenant.tenantId,
  });
  const jti = newJti();
  const refreshToken = signRefreshToken(String(user._id), tenant.tenantId, jti);
  await storeRefreshToken(String(user._id), tenant.tenantId, jti);

  return {
    accessToken,
    refreshToken,
    user: userJson,
    tenant: {
      tenantId: tenant.tenantId,
      companyName: tenant.companyName,
      subscriptionPlan: tenant.subscriptionPlan,
    },
  };
}

function slugFromCompany(companyName: string): string {
  return companyName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export { UserRole };