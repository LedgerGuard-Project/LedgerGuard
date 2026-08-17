import type { ObjectId } from './primitives';

/** Enterprise roles that control access across the platform. */
export enum UserRole {
  SuperAdmin = 'super_admin',
  CompanyAdmin = 'company_admin',
  FinanceManager = 'finance_manager',
  Viewer = 'viewer',
}

export type UserStatus = 'active' | 'invited' | 'disabled';

export interface User {
  id: ObjectId;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSummary {
  id: ObjectId;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

/** Hierarchy used to enforce role-based access. */
export const ROLE_WEIGHT: Record<UserRole, number> = {
  [UserRole.SuperAdmin]: 100,
  [UserRole.CompanyAdmin]: 60,
  [UserRole.FinanceManager]: 40,
  [UserRole.Viewer]: 10,
};

export function canManageUsers(role: UserRole): boolean {
  return ROLE_WEIGHT[role] >= ROLE_WEIGHT[UserRole.CompanyAdmin];
}

export function isAdmin(role: UserRole): boolean {
  return role === UserRole.SuperAdmin || role === UserRole.CompanyAdmin;
}