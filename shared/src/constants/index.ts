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
  // ---- Enterprise extension ----
  exceptionCreated: 'exception:created',
  exceptionUpdated: 'exception:updated',
  webhookDelivered: 'webhook:delivered',
  webhookFailed: 'webhook:failed',
  subscriptionUpdated: 'subscription:updated',
  jobFailed: 'job:failed',
} as const;

/**
 * SLA policy (hours) per operational work item type. Configurable defaults —
 * tenants may override per exception via `dueAt` at creation time.
 */
export const DEFAULT_SLA_HOURS: Record<string, number> = {
  payment_exception: 4,
  reconciliation: 24,
  approval: 8,
  webhook_failure: 2,
  failed_payment: 4,
  overdue_invoice: 48,
};

/** SLA evaluation: share of the budget elapsed before a task is "at risk". */
export const SLA_AT_RISK_RATIO = 0.75;

export const EXCEPTION_TYPE_LABELS: Record<string, string> = {
  unmatched_payment: 'Unmatched Payment',
  duplicate_payment: 'Duplicate Payment',
  failed_payment: 'Failed Payment',
  partial_payment: 'Partial Payment',
  amount_mismatch: 'Amount Mismatch',
  unknown_customer: 'Unknown Customer',
  unknown_invoice: 'Unknown Invoice',
  timeout: 'Timeout',
  webhook_mismatch: 'Webhook Mismatch',
  status_mismatch: 'Status Mismatch',
};

export const BILLING_RULE_TYPE_LABELS: Record<string, string> = {
  discount: 'Discount',
  tax_override: 'Tax Override',
  minimum_charge: 'Minimum Charge',
  maximum_charge: 'Maximum Charge',
  grace_period: 'Grace Period',
  late_fee: 'Late Fee',
};

export const COMMUNICATION_EVENT_LABELS: Record<string, string> = {
  'invoice.sent': 'Invoice Sent',
  'payment.confirmation': 'Payment Confirmation',
  'payment.failed': 'Payment Failure',
  'payment.reminder': 'Payment Reminder',
  'overdue.reminder': 'Overdue Reminder',
  'subscription.renewal': 'Subscription Renewal',
  'credit_note.notification': 'Credit Note',
  'refund.notification': 'Refund',
  'system.notification': 'System Notification',
};

export const DEFAULT_BILLING_RULES: Array<{
  name: string;
  type: string;
  action: Record<string, string | number | boolean>;
  priority: number;
}> = [
  { name: 'Standard 10% early discount', type: 'discount', action: { percent: 10 }, priority: 10 },
  { name: 'Default 18% tax', type: 'tax_override', action: { percent: 18 }, priority: 10 },
  { name: 'Minimum invoice $5', type: 'minimum_charge', action: { amountMinor: 500 }, priority: 20 },
  { name: '30-day net terms grace', type: 'grace_period', action: { days: 30 }, priority: 20 },
];