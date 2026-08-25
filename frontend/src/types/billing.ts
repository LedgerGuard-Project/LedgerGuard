export type {
  Customer,
  CustomerSummary,
  CustomerAddress,
  CustomerStatus,
  BillingAccount,
  BillingAccountSummary,
  BillingAccountStatus,
  LedgerTransaction,
  LedgerTransactionSummary,
  LedgerTransactionType,
  LedgerTransactionStatus,
  PaymentMethod,
  LedgerEntry,
  LedgerDirection,
  LedgerEntryType,
  LedgerPostingGroup,
  Invoice,
  InvoiceSummary,
  InvoiceItem,
  InvoiceStatus,
  IdempotencyRecord,
  IdempotencyStatus,
  BillingNotification,
  BillingNotificationType,
  ReconciliationRun,
  ReconciliationDiscrepancy,
  ReconciliationStatus,
  ReconciliationCheckType,
  ReconciliationEntityType,
  BankTransaction,
  BankTransactionSummary,
  BankTransactionStatus,
  BankMatchConfidence,
  ReconciliationDashboard,
  ImportSummary,
  ReportType,
  ReportResult,
  ReportColumn,
  ReportRow,
  ReportSummary,
  ReportFilters,
  RecurringPlan,
  RecurringInterval,
  RecurringStatus,
  RecurringInvoiceStatus,
  RecurringInvoicePreview,
  TaxRate,
  TaxBreakdown,
  InvoiceTaxCalculation,
  CreditNote,
  DebitNote,
  NoteStatus,
  ApprovalRequest,
  ApprovalResourceType,
  ApprovalStatus,
  FinancialPeriod,
  FinancialPeriodStatusInfo,
} from '@ledgerguard/shared';

export {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  PAYMENT_METHODS,
  LEDGER_DIRECTIONS,
  LEDGER_ENTRY_TYPES,
  INVOICE_STATUSES,
  SUPPORTED_CURRENCIES,
  SOCKET_EVENTS,
  RECONCILIATION_STATUSES,
  RECONCILIATION_CHECK_TYPES,
  BANK_TRANSACTION_STATUSES,
  BANK_MATCH_CONFIDENCE,
  REPORT_TYPES,
  RECURRING_INTERVALS,
  RECURRING_STATUSES,
  RECURRING_INVOICE_STATUSES,
  NOTE_STATUSES,
  APPROVAL_RESOURCE_TYPES,
  APPROVAL_STATUSES,
  FINANCIAL_PERIOD_STATUSES,
} from '@ledgerguard/shared';
export type { SupportedCurrency } from '@ledgerguard/shared';

export interface BillingTransactionMini {
  transactionId: string;
  type: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
}

export interface TrendPoint {
  key: string;
  label: string;
  amountMinor: number;
}

export interface BillingSummary {
  currency: string;
  totalRevenueMinor: number;
  todayRevenueMinor: number;
  pendingCount: number;
  pendingAmountMinor: number;
  failedCount: number;
  failedAmountMinor: number;
  outstandingInvoicesMinor: number;
  outstandingInvoicesCount: number;
  currentBalanceMinor: number;
  monthlyBillingMinor: number;
  monthlyBillingCount: number;
  recentTransactions: BillingTransactionMini[];
  // Phase 2 analytics additions (backend-only when absent)
  totalCollectedMinor?: number;
  refundTotalMinor?: number;
  invoiceCount?: number;
  paidInvoiceCount?: number;
  overdueInvoiceCount?: number;
  revenueTrend?: TrendPoint[];
  paymentTrend?: TrendPoint[];
  invoiceStatusDist?: Record<string, number>;
  reconciliation?: {
    totalBankTransactions: number;
    matchedCount: number;
    unmatchedCount: number;
    mismatchCount: number;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page?: number;
  perPage?: number;
  totalPages?: number;
}