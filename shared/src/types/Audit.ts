import type { ObjectId } from './primitives';
import type { UserRole } from './User';

/** High-level actions that are persisted to the audit log. */
export enum AuditAction {
  Login = 'login',
  Logout = 'logout',
  Register = 'register',
  RefreshToken = 'refresh_token',
  UserCreated = 'user_created',
  PermissionChanged = 'permission_changed',
  UserStatusChanged = 'user_status_changed',
  TenantCreated = 'tenant_created',
  TenantUpdated = 'tenant_updated',
}

export interface AuditLogEntry {
  id: ObjectId;
  tenantId: string;
  actorId?: string;
  actorEmail?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}