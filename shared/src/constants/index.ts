import type { SubscriptionPlan } from '../types/Tenant';

export const APP_NAME = 'LedgerGuard';

export const DEFAULT_DB_PREFIX = 'lg_';

export const SUBSCRIPTION_PLANS: Record<
  SubscriptionPlan,
  { label: string; monthlyCredits: number; maxUsers: number }
> = {
  free: { label: 'Free', monthlyCredits: 100, maxUsers: 5 },
  starter: { label: 'Starter', monthlyCredits: 1000, maxUsers: 20 },
  pro: { label: 'Pro', monthlyCredits: 5000, maxUsers: 100 },
  enterprise: { label: 'Enterprise', monthlyCredits: Infinity, maxUsers: Infinity },
};

export const API_PATHS = {
  auth: {
    register: '/api/auth/register',
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    refresh: '/api/auth/refresh',
    me: '/api/auth/me',
  },
  users: '/api/users',
  tenants: '/api/tenants',
  dashboard: '/api/dashboard/summary',
} as const;

/** Role / permission labels used across the UI. */
export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  company_admin: 'Company Admin',
  finance_manager: 'Finance Manager',
  viewer: 'Viewer',
};

export const SUBSCRIPTION_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};