import type { ObjectId } from './primitives';

/** Least-privilege API key permission scopes. */
export const API_KEY_PERMISSIONS = [
  'READ',
  'WRITE',
  'BILLING',
  'PAYMENTS',
  'REPORTS',
  'WEBHOOKS',
  'ADMIN',
] as const;
export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

/** Effective role a key receives for each permission scope (least privilege). */
export const API_KEY_PERMISSION_ROLES: Record<ApiKeyPermission, string> = {
  READ: 'viewer',
  WRITE: 'accountant',
  BILLING: 'finance_manager',
  PAYMENTS: 'finance_manager',
  REPORTS: 'accountant',
  WEBHOOKS: 'finance_manager',
  ADMIN: 'company_admin',
};

/** Prefix every raw API key so it is visually identifiable and never a JWT. */
export const API_KEY_PREFIX = 'lgk_';

/**
 * A platform API key. Only the SHA-256 hash of the raw key is ever stored;
 * the raw value is returned exactly once at creation/rotation.
 */
export interface ApiKey {
  id: ObjectId;
  /** Stable public identifier, e.g. "KEY-ab12cd34". */
  keyId: string;
  tenantId: string;
  name: string;
  /** Non-secret key prefix stored for display, e.g. "lgk_9f2a…". */
  displayPrefix: string;
  /** SHA-256 hex digest of the raw key. The raw key is never persisted. */
  keyHash: string;
  permissions: ApiKeyPermission[];
  createdBy: { id: string; email: string };
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  revokedBy?: { id: string; email: string };
  createdAt: string;
  updatedAt: string;
}

/** Response shape returned once after create/rotate (raw key included). */
export interface ApiKeyCreated {
  apiKey: ApiKey;
  /** Full raw key — shown exactly once, never stored server-side. */
  rawKey: string;
}