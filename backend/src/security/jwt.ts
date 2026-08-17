import jwt, { type SignOptions } from 'jsonwebtoken';
import { config, REFRESH_TOKEN_PREFIX, REFRESH_TTL_SECONDS } from '../config';
import { ApiError } from '../utils/ApiError';
import { cache } from '../database/cache';

export interface AccessTokenPayload {
  /** tenant-scoped user id */
  sub: string;
  email: string;
  role: string;
  /** tenant slug */
  tenantId: string;
}

export interface RefreshTokenPayload {
  /** tenant-scoped user id */
  sub: string;
  tenantId: string;
  /** random id used to match the stored refresh token */
  jti: string;
}

export function signAccessToken(payload: {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
}): string {
  const sign: AccessTokenPayload = {
    sub: payload.userId,
    email: payload.email,
    role: payload.role,
    tenantId: payload.tenantId,
  };
  return jwt.sign(sign, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, config.jwtSecret) as AccessTokenPayload;
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token', 'INVALID_ACCESS_TOKEN');
  }
}

export function signRefreshToken(userId: string, tenantId: string, jti: string): string {
  const payload: RefreshTokenPayload = { sub: userId, tenantId, jti };
  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn as SignOptions['expiresIn'],
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return jwt.verify(token, config.jwtRefreshSecret) as RefreshTokenPayload;
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }
}

function storageKey(tenantId: string, userId: string, jti: string): string {
  return `${REFRESH_TOKEN_PREFIX}${tenantId}:${userId}:${jti}`;
}

/** Persist a refresh token so it can be revoked on logout / rotation. */
export async function storeRefreshToken(
  userId: string,
  tenantId: string,
  jti: string,
): Promise<void> {
  await cache.set(storageKey(tenantId, userId, jti), 'active', REFRESH_TTL_SECONDS);
}

export async function revokeRefreshToken(
  tenantId: string,
  userId: string,
  jti: string,
): Promise<void> {
  await cache.del(storageKey(tenantId, userId, jti));
}

export async function isRefreshTokenStored(
  tenantId: string,
  userId: string,
  jti: string,
): Promise<boolean> {
  return (await cache.get(storageKey(tenantId, userId, jti))) === 'active';
}

export function newJti(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}