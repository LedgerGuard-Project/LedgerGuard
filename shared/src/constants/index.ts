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
  accountant: 'Accountant',
  viewer: 'Viewer',
};

export const SUBSCRIPTION_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

/** ISO 4217 currencies supported by the billing engine (all 2-decimal minor units). */
export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'INR',
  'AUD',
  'CAD',
  'SGD',
  'AED',
] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_LABELS: Record<string, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  INR: 'Indian Rupee',
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  SGD: 'Singapore Dollar',
  AED: 'UAE Dirham',
};

/** Socket.io events emitted by the billing engine. */
export const SOCKET_EVENTS = {
  paymentProcessing: 'payment:processing',
  paymentCompleted: 'payment:completed',
  paymentFailed: 'payment:failed',
  paymentRolledBack: 'payment:rolled_back',
  invoiceCreated: 'invoice:created',
  invoicePaid: 'invoice:paid',
  invoiceCancelled: 'invoice:cancelled',
  ledgerUpdated: 'ledger:updated',
  notification: 'billing:notification',
  ledgerReconciled: 'ledger:reconciled',
  reconciliationMatched: 'reconciliation:matched',
  reconciliationMismatch: 'reconciliation:mismatch',
  notificationCreated: 'notification:created',
  recurringInvoiceCreated: 'recurring_invoice:created',
  recurringBillingPaused: 'recurring_billing:paused',
  recurringBillingCancelled: 'recurring_billing:cancelled',
  approvalCreated: 'approval:created',
  approvalApproved: 'approval:approved',
  approvalRejected: 'approval:rejected',
  creditNoteCreated: 'credit_note:created',
  debitNoteCreated: 'debit_note:created',
  financialPeriodClosed: 'financial_period:closed',
  financialPeriodReopened: 'financial_period:reopened',
} as const;