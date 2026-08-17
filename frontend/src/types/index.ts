import type { User } from '@ledgerguard/shared';

export type {
  User,
  UserSummary,
  UserStatus,
  Tenant,
  TenantSummary,
  SubscriptionPlan,
  SubscriptionStatus,
  AuditAction,
  AuditLogEntry,
  ApiResponse,
  ApiError,
  PaginatedResult,
} from '@ledgerguard/shared';

export { UserRole, ROLE_WEIGHT, ROLE_LABELS } from '@ledgerguard/shared';

/** Tenant details persisted on the frontend for the active session. */
export interface TenantSession {
  tenantId: string;
  companyName: string;
  subscriptionPlan: string;
  status?: string;
}

/** Session returned by register/login/refresh endpoints. */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: User;
  tenant: TenantSession;
}

/** Response of GET /auth/me. */
export interface MeResult {
  user: User;
  tenant: TenantSession;
}

/** Response of GET /dashboard/summary. */
export interface DashboardSummary {
  tenant: TenantSession;
  stats: {
    totalRevenue: number;
    activeUsers: number;
    userLimit: number;
    monthlyUsage: number;
    monthlyCredits: number;
  };
}