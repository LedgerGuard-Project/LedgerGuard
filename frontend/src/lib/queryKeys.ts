/** Centralized react-query key factory for the billing domain. */

function listKey(base: readonly unknown[], params?: Record<string, unknown>): readonly unknown[] {
  if (!params || Object.keys(params).length === 0) return base;
  return [...base, params];
}

export const queryKeys = {
  billingSummary: ['billing', 'summary'],

  customers: {
    base: ['billing', 'customers'] as const,
    list: (params?: Record<string, unknown>) => listKey(queryKeys.customers.base, params),
  },
  customer: (id?: string) => ['billing', 'customer', id ?? 'list'] as const,

  invoices: {
    base: ['billing', 'invoices'] as const,
    list: (params?: Record<string, unknown>) => listKey(queryKeys.invoices.base, params),
  },
  invoice: (id?: string) => ['billing', 'invoice', id ?? 'list'] as const,

  payments: {
    base: ['billing', 'payments'] as const,
    list: (params?: Record<string, unknown>) => listKey(queryKeys.payments.base, params),
  },

  ledger: {
    base: ['billing', 'ledger'] as const,
    list: (params?: Record<string, unknown>) => listKey(queryKeys.ledger.base, params),
  },
  transaction: (id?: string) => ['billing', 'transaction', id ?? 'list'] as const,

  accounts: {
    base: ['billing', 'accounts'] as const,
    list: (params?: Record<string, unknown>) => listKey(queryKeys.accounts.base, params),
  },

  notifications: ['billing', 'notifications'] as const,

    reconciliation: {
    base: ['billing', 'reconciliation'] as const,
    byKey: (key: string) => ['billing', 'reconciliation', key] as const,
  },

  // ---- Bank reconciliation dashboard + bank rows ----
  bankTransactions: {
    base: ['billing', 'bank-transactions'] as const,
    list: (params?: Record<string, unknown>) => listKey(['billing', 'bank-transactions'], params),
  },
  reconciliationDashboard: ['billing', 'reconciliation-dashboard'] as const,

  // ---- Reports ----
  report: (reportType?: string) => ['billing', 'report', reportType ?? 'all'] as const,

  // ---- Phase 2 ----
  taxRates: ['billing', 'tax-rates'] as const,
  recurringPlans: ['billing', 'recurring'] as const,
  creditNotes: ['billing', 'credit-notes'] as const,
  debitNotes: ['billing', 'debit-notes'] as const,
  approvals: ['billing', 'approvals'] as const,
    financialPeriods: ['billing', 'financial-periods'] as const,

  // ---- Recurring plan preview ----
  recurringPlanDetail: (planId?: string) => ['billing', 'recurring-plan', planId ?? 'list'] as const,
  recurringPreview: (planId?: string) => ['billing', 'recurring-preview', planId ?? 'list'] as const,

  // ---- Enterprise extension ----
  exceptions: {
    base: ['billing', 'exceptions'] as const,
    list: (params?: Record<string, unknown>) => listKey(queryKeys.exceptions.base, params),
  },
  operationsQueue: ['operations', 'queue'] as const,
  closeDashboard: ['operations', 'close'] as const,
  apiKeys: ['developer', 'api-keys'] as const,
  webhooks: {
    base: ['developer', 'webhooks'] as const,
    deliveries: (endpointId?: string) => ['developer', 'webhooks', 'deliveries', endpointId ?? 'none'] as const,
  },
};
