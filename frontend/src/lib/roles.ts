import { ROLE_WEIGHT, UserRole, type User } from '@ledgerguard/shared';

export const ROLE_ORDER: UserRole[] = [
  UserRole.Viewer,
  UserRole.FinanceManager,
  UserRole.CompanyAdmin,
  UserRole.SuperAdmin,
];

export function roleWeight(role: UserRole | string): number {
  if (Object.values(UserRole).includes(role as UserRole)) return ROLE_WEIGHT[role as UserRole] ?? -1;
  return -1;
}

export function canAct(userRole: UserRole | string, required: UserRole): boolean {
  return roleWeight(userRole) >= roleWeight(required);
}

export function roleLabel(role: UserRole | string | undefined): string {
  if (!role) return '—';
  const labels: Record<string, string> = {
    [UserRole.Viewer]: 'Viewer',
        [UserRole.FinanceManager]: 'Finance Manager',
    [UserRole.CompanyAdmin]: 'Company Admin',
    [UserRole.SuperAdmin]: 'Super Admin',
  };
  return labels[role as string] ?? role;
}

export function isSuperAdmin(user: Pick<User, 'role'> | null | undefined): boolean {
  if (!user) return false;
  return canAct(user.role, UserRole.SuperAdmin);
}

export function isCompanyAdmin(user: Pick<User, 'role'> | null | undefined): boolean {
  if (!user) return false;
  return canAct(user.role, UserRole.CompanyAdmin);
}