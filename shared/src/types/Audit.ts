import type { ObjectId } from './primitives';
import type { UserRole } from './User';

/** High-level actions that are persisted to the audit log. */
export enum AuditAction {
  Login = 'login',
  Logout = 'logout',
  Register = 'register',
  RefreshToken = 'refresh_token',
  UserCreated = 'user_created',
  PermissionChanged = 'permission_changed',
  UserStatusChanged = 'user_status_changed',
  TenantCreated = 'tenant_created',
  TenantUpdated = 'tenant_updated',
  // ---- Billing / financial actions (Phase 2) ----
  CustomerCreated = 'customer_created',
  CustomerUpdated = 'customer_updated',
  InvoiceCreated = 'invoice_created',
  InvoiceUpdated = 'invoice_updated',
  InvoiceCancelled = 'invoice_cancelled',
  InvoicePaid = 'invoice_paid',
  PaymentCreated = 'payment_created',
  PaymentCompleted = 'payment_completed',
  PaymentFailed = 'payment_failed',
  PaymentRolledBack = 'payment_rolled_back',
  RefundCreated = 'refund_created',
  LedgerEntryCreated = 'ledger_entry_created',
  NotificationRead = 'notification_read',
  LedgerReconciled = 'ledger_reconciled',
  ReconciliationImported = 'reconciliation_imported',
  ManualMatchCreated = 'manual_match_created',
  ManualMatchRemoved = 'manual_match_removed',
  BankTransactionIgnored = 'bank_transaction_ignored',
    ReportExported = 'report_exported',
  PaymentRetried = 'payment_retried',
  InvoicePdfDownloaded = 'invoice_pdf_downloaded',
  NotificationCreated = 'notification_created',
  // ---- Recurring billing ----
  RecurringPlanCreated = 'recurring_plan_created',
  RecurringPlanUpdated = 'recurring_plan_updated',
  RecurringPlanPaused = 'recurring_plan_paused',
  RecurringPlanResumed = 'recurring_plan_resumed',
  RecurringPlanCancelled = 'recurring_plan_cancelled',
  RecurringInvoiceGenerated = 'recurring_invoice_generated',
  // ---- Tax ----
  TaxRateCreated = 'tax_rate_created',
  TaxRateUpdated = 'tax_rate_updated',
  TaxRateDeactivated = 'tax_rate_deactivated',
  // ---- Credit / Debit notes ----
  CreditNoteCreated = 'credit_note_created',
  CreditNoteIssued = 'credit_note_issued',
  CreditNoteCancelled = 'credit_note_cancelled',
  DebitNoteCreated = 'debit_note_created',
  DebitNoteIssued = 'debit_note_issued',
  // ---- Approval workflow ----
  ApprovalRequested = 'approval_requested',
  ApprovalApproved = 'approval_approved',
  ApprovalRejected = 'approval_rejected',
  ApprovalCancelled = 'approval_cancelled',
  // ---- Financial periods ----
  FinancialPeriodCreated = 'financial_period_created',
  FinancialPeriodClosed = 'financial_period_closed',
  FinancialPeriodReopened = 'financial_period_reopened',
  // ---- Payment / reconciliation exceptions ----
  ExceptionCreated = 'exception_created',
  ExceptionAssigned = 'exception_assigned',
  ExceptionInvestigating = 'exception_investigating',
  ExceptionResolved = 'exception_resolved',
  ExceptionReopened = 'exception_reopened',
  // ---- Billing rules ----
  BillingRuleCreated = 'billing_rule_created',
  BillingRuleUpdated = 'billing_rule_updated',
  BillingRuleDeleted = 'billing_rule_deleted',
  BillingRuleStatusChanged = 'billing_rule_status_changed',
  // ---- Staff actions on communication center ----
  CommunicationCreated = 'communication_created',
  CommunicationRetried = 'communication_retried',
  // ---- Saved views ----
  SavedViewCreated = 'saved_view_created',
  SavedViewDeleted = 'saved_view_deleted',
  // ---- Compliance evidence ----
  ComplianceEvidenceGenerated = 'compliance_evidence_generated',
  // ---- API keys ----
  ApiKeyCreated = 'api_key_created',
  ApiKeyRevoked = 'api_key_revoked',
  ApiKeyRotated = 'api_key_rotated',
  // ---- Webhooks ----
  WebhookEndpointCreated = 'webhook_endpoint_created',
  WebhookEndpointUpdated = 'webhook_endpoint_updated',
  WebhookSecretRotated = 'webhook_secret_rotated',
  WebhookDeliveryRetried = 'webhook_delivery_retried',
  WebhookTested = 'webhook_tested',
}

export interface AuditLogEntry {
  id: ObjectId;
  tenantId: string;
  actorId?: string;
  actorEmail?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}