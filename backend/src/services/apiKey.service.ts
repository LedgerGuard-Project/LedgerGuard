import {
  API_KEY_PERMISSION_ROLES,
  ROLE_WEIGHT,
  UserRole,
  type ApiKeyPermission,
} from '@ledgerguard/shared';
import { ApiKeyModel, type ApiKeyDocument } from '../models/ApiKey';
import { ApiError } from '../utils/ApiError';
import { generateApiKey } from '../utils/apiKeyCrypto';
import { newApiKeyId } from '../utils/ids';

export interface CreateApiKeyInput {
  name: string;
  permissions: ApiKeyPermission[];
  expiresAt?: Date | null;
  actor: { id: string; email: string };
}

export interface ApiKeyWithSecret {
  apiKey: ApiKeyDocument;
  rawKey: string;
}

/**
 * The effective role an API key receives is the highest role granted by any of
 * its permission scopes (least privilege: a READ-only key maps to viewer).
 */
export function effectiveRoleFor(permissions: ApiKeyPermission[]): UserRole {
  let best: UserRole = UserRole.Viewer;
  let bestWeight = 0;
  for (const permission of permissions) {
    const role = API_KEY_PERMISSION_ROLES[permission] as UserRole;
    const roleWeight = ROLE_WEIGHT[role] ?? 0;
    if (roleWeight > bestWeight) {
      best = role;
      bestWeight = roleWeight;
    }
  }
  return best;
}

export async function createApiKey(
  tenantId: string,
  input: CreateApiKeyInput,
): Promise<ApiKeyWithSecret> {
  if (!input.name || input.name.trim().length === 0) {
    throw ApiError.badRequest('API key name is required', 'NAME_REQUIRED');
  }
  if (!Array.isArray(input.permissions) || input.permissions.length === 0) {
    throw ApiError.badRequest('At least one permission is required', 'PERMISSIONS_REQUIRED');
  }
  const { rawKey, keyHash, displayPrefix } = generateApiKey();
  const doc = await ApiKeyModel.create({
    keyId: newApiKeyId(),
    tenantId,
    name: input.name.trim(),
    displayPrefix,
    keyHash,
    permissions: input.permissions,
    createdBy: input.actor,
    expiresAt: input.expiresAt ?? undefined,
  });
  return { apiKey: doc, rawKey };
}

export async function listApiKeys(tenantId: string): Promise<ApiKeyDocument[]> {
  // Projections exclude the hash — API responses never carry key material.
  return ApiKeyModel.find({ tenantId })
    .sort({ createdAt: -1 })
    .select('-keyHash')
    .limit(200);
}

export async function revokeApiKey(
  tenantId: string,
  keyId: string,
  actor: { id: string; email: string },
): Promise<ApiKeyDocument> {
  const key = await ApiKeyModel.findOne({ tenantId, keyId }).select('-keyHash');
  if (!key) throw ApiError.notFound('API key not found', 'API_KEY_NOT_FOUND');
  if (key.revokedAt) {
    throw ApiError.conflict('API key is already revoked', 'API_KEY_ALREADY_REVOKED');
  }
  key.revokedAt = new Date();
  key.revokedBy = actor;
  await key.save();
  return key;
}

/** Rotate = revoke the old key + issue a new one with the same permissions. */
export async function rotateApiKey(
  tenantId: string,
  keyId: string,
  actor: { id: string; email: string },
): Promise<ApiKeyWithSecret> {
  const key = await ApiKeyModel.findOne({ tenantId, keyId }).select('permissions name revokedAt');
  if (!key) throw ApiError.notFound('API key not found', 'API_KEY_NOT_FOUND');
  if (key.revokedAt) {
    throw ApiError.conflict('Revoked API keys cannot be rotated; create a new key', 'API_KEY_REVOKED');
  }
  await revokeApiKey(tenantId, keyId, actor);
  return createApiKey(tenantId, {
    name: key.name,
    permissions: key.permissions as ApiKeyPermission[],
    actor,
  });
}

/**
 * Resolve a raw API key to its stored document. Returns null for unknown,
 * revoked, or expired keys (the middleware maps all of these to 401).
 */
export async function findUsableApiKey(rawKey: string): Promise<ApiKeyDocument | null> {
  const { hashApiKey } = await import('../utils/apiKeyCrypto');
  const keyHash = hashApiKey(rawKey);
  const key = await ApiKeyModel.findOne({ keyHash });
  if (!key) return null;
  if (key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return null;
  // Fire-and-forget last-used stamp (throttled to once per minute per key).
  const now = Date.now();
  if (!key.lastUsedAt || now - key.lastUsedAt.getTime() > 60_000) {
    void ApiKeyModel.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } }).catch(
      () => undefined,
    );
  }
  return key;
}