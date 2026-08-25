import { ROLE_WEIGHT, UserRole } from '@ledgerguard/shared';

/**
 * Billing role matrix (Phase 2):
 *  - Company Admin : view + customers + invoices + payments + refunds + export
 *  - Finance Manager : view + invoices + payments + refunds
 *  - Viewer : read-only
 *  - Super Admin : platform-level, everything
 */
function weight(role: UserRole | string): number {
  return ROLE_WEIGHT[role as UserRole] ?? 0;
}

export function canViewBilling(role: UserRole | string | undefined): boolean {
  return role !== undefined;
}

export function canCreateCustomers(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.CompanyAdmin];
}

export function canManageCustomers(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.CompanyAdmin];
}

export function canCreateInvoices(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.FinanceManager];
}

export function canProcessPayments(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.FinanceManager];
}

export function canRefundPayments(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.FinanceManager];
}

export function canManageRecurring(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.FinanceManager];
}

export function canManageTaxRates(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.FinanceManager];
}

export function canManageNotes(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.FinanceManager];
}

export function canManageApprovals(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.FinanceManager];
}

export function canManageFinancialPeriods(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.FinanceManager];
}

export function canReopenPeriods(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.CompanyAdmin];
}

export function canViewReports(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.Accountant];
}

export function canExportBilling(role: UserRole | string | undefined): boolean {
  return weight(role as UserRole) >= ROLE_WEIGHT[UserRole.CompanyAdmin];
}
