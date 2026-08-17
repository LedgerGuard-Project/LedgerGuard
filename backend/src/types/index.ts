import type { Request } from 'express';
import type { Connection } from 'mongoose';
import type { TenantDocument } from '../models/Tenant';
import type { TenantModels } from '../database/models.factory';
import type { UserRole, User } from '@ledgerguard/shared';

/** Per-request tenant context resolved by the multi-tenant middleware. */
export interface TenantContext {
  /** Global tenant document. */
  tenant: TenantDocument;
  /** Dedicated Mongoose connection for this tenant's database. */
  connection: Connection;
  /** Cached tenant-scoped models. */
  models: TenantModels;
}

/** Authenticated user derived from the tenant-scoped User model. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  tenantId: string;
}

export interface AuthenticatedRequest extends Request {
  tc?: TenantContext;
  authUser?: AuthUser;
  accessToken?: string;
}

export interface RefreshRequest extends Request {
  refreshContext?: {
    userId: string;
    tenantId: string;
    tokenId: string;
  };
}

export interface Pagination {
  page: number;
  perPage: number;
  skip: number;
}

export { User };