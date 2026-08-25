import { apiClient } from '../lib/api';
import type {
  BillingAccount,
  BillingNotification,
  BillingSummary,
  Customer,
  Invoice,
  LedgerEntry,
  LedgerTransaction,
  Paginated,
  ReconciliationRun,
  ReconciliationDashboard,
  BankTransaction,
  ReportResult,
  ReportType,
  TaxRate,
  RecurringPlan,
  RecurringInvoicePreview,
  CreditNote,
  DebitNote,
  ApprovalRequest,
  FinancialPeriod,
} from '../types/billing';

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  billingAddress?: Record<string, string | undefined>;
  taxId?: string;
  currency?: string;
}

export interface CreateInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface CreateInvoiceInput {
  customerId: string;
  currency: string;
  items: CreateInvoiceLine[];
  status?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  discount?: number;
}

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  customerId: string;
  invoiceId?: string;
  reference?: string;
  description?: string;
  paymentMethod?: string;
}

export interface PaymentResult {
  status: 'completed' | 'processing' | 'replay';
  transaction?: LedgerTransaction;
  ledgerEntries?: LedgerEntry[];
  account?: BillingAccount;
  invoice?: Invoice | null;
  idempotencyKey: string;
  idempotencyStatus: 'completed' | 'processing';
  replay?: boolean;
  degraded?: boolean;
}

export interface TransactionDetail {
  transaction: LedgerTransaction;
  customer: { customerId: string; name: string } | null;
  entries: LedgerEntry[];
  auditEvents: Array<{ action: string; createdAt: string; details?: Record<string, unknown> }>;
  idempotency: { status: string; key: string; createdAt: string } | null;
}

export const billingService = {
  async summary(): Promise<BillingSummary> {
    const { data } = await apiClient.get<{ success: boolean; data: BillingSummary }>('/billing/summary');
    return data.data;
  },

  // ---- Customers ----
  async listCustomers(params: Record<string, unknown> = {}): Promise<Paginated<Customer>> {
    const { data } = await apiClient.get<{ success: boolean; data: Paginated<Customer> }>('/billing/customers', { params });
    return data.data;
  },
  async getCustomer(customerId: string) {
    const { data } = await apiClient.get<{ success: boolean; data: Record<string, unknown> }>(`/billing/customers/${customerId}`);
    return data.data;
  },
  async createCustomer(input: CreateCustomerInput) {
    const { data } = await apiClient.post<{ success: boolean; data: { customer: Customer; account: BillingAccount | null } }>('/billing/customers', input);
    return data.data;
  },
  async updateCustomer(customerId: string, input: Partial<CreateCustomerInput>) {
    const { data } = await apiClient.patch<{ success: boolean; data: { customer: Customer } }>(`/billing/customers/${customerId}`, input);
    return data.data;
  },

  // ---- Invoices ----
  async listInvoices(params: Record<string, unknown> = {}): Promise<Paginated<Invoice>> {
    const { data } = await apiClient.get<{ success: boolean; data: Paginated<Invoice> }>('/billing/invoices', { params });
    return data.data;
  },
  async getInvoice(invoiceId: string) {
    const { data } = await apiClient.get<{ success: boolean; data: { invoice: Invoice; payments: LedgerTransaction[] } }>(`/billing/invoices/${invoiceId}`);
    return data.data;
  },
  async createInvoice(input: CreateInvoiceInput) {
    const { data } = await apiClient.post<{ success: boolean; data: { invoice: Invoice } }>('/billing/invoices', input);
    return data.data;
  },
  async updateInvoice(invoiceId: string, input: Partial<CreateInvoiceInput>) {
    const { data } = await apiClient.patch<{ success: boolean; data: { invoice: Invoice } }>(`/billing/invoices/${invoiceId}`, input);
    return data.data;
  },
  async issueInvoice(invoiceId: string, dueDate?: string) {
    const { data } = await apiClient.post<{ success: boolean; data: { invoice: Invoice } }>(`/billing/invoices/${invoiceId}/issue`, { dueDate });
    return data.data;
  },
  async cancelInvoice(invoiceId: string) {
    const { data } = await apiClient.post<{ success: boolean; data: { invoice: Invoice } }>(`/billing/invoices/${invoiceId}/cancel`);
    return data.data;
  },
  async markInvoicePaid(invoiceId: string) {
    const { data } = await apiClient.post<{ success: boolean; data: { invoice: Invoice } }>(`/billing/invoices/${invoiceId}/mark-paid`);
    return data.data;
  },

  // ---- Payments ----
  async listPayments(params: Record<string, unknown> = {}): Promise<Paginated<LedgerTransaction>> {
    const { data } = await apiClient.get<{ success: boolean; data: Paginated<LedgerTransaction> }>('/billing/payments', { params });
    return data.data;
  },
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const { data } = await apiClient.post<{ success: boolean; data: PaymentResult }>('/billing/payments', input);
    return data.data;
  },
  async refundPayment(transactionId: string, input: { amount: number; reference?: string; description?: string }) {
    const { data } = await apiClient.post<{ success: boolean; data: PaymentResult }>(`/billing/payments/${transactionId}/refund`, input);
    return data.data;
  },
  async getTransaction(transactionId: string): Promise<TransactionDetail> {
    const { data } = await apiClient.get<{ success: boolean; data: TransactionDetail }>(`/billing/ledger/${transactionId}`);
    return data.data;
  },

  // ---- Ledger ----
  async listLedger(params: Record<string, unknown> = {}): Promise<Paginated<LedgerTransaction>> {
    const { data } = await apiClient.get<{ success: boolean; data: Paginated<LedgerTransaction> }>('/billing/ledger', { params });
    return data.data;
  },

  // ---- Accounts ----
  async listAccounts(params: Record<string, unknown> = {}): Promise<Paginated<BillingAccount>> {
    const { data } = await apiClient.get<{ success: boolean; data: Paginated<BillingAccount> }>('/billing/accounts', { params });
    return data.data;
  },

  // ---- Notifications ----
  async listNotifications(): Promise<{ notifications: BillingNotification[]; unread: number }> {
    const { data } = await apiClient.get<{ success: boolean; data: { notifications: BillingNotification[]; unread: number } }>('/billing/notifications');
    return data.data;
  },
  async markNotificationRead(id: string) {
    await apiClient.patch(`/billing/notifications/${id}/read`);
  },
  async markAllNotificationsRead() {
    await apiClient.patch('/billing/notifications/read-all');
  },

  // ---- Reconciliation (idempotent ledger health) ----
  async reconcile(repair = false) {
    const { data } = await apiClient.post<{
      success: boolean;
      data: { run: ReconciliationRun; idempotencyKey: string; idempotencyStatus: string; replay?: boolean; degraded?: boolean };
    }>('/billing/reconciliation', { repair });
    return data.data;
  },
    async getReconciliation(key: string) {
    const { data } = await apiClient.get<{
      success: boolean;
      data: { run: ReconciliationRun; idempotencyKey: string; idempotencyStatus: string; replay?: boolean; degraded?: boolean };
    }>(`/billing/reconciliation/${encodeURIComponent(key)}`);
    return data.data;
  },

  // ---- Bank reconciliation dashboard + bank rows ----
  async reconciliationDashboard(): Promise<ReconciliationDashboard> {
    const { data } = await apiClient.get<{ success: boolean; data: ReconciliationDashboard }>('/billing/reconciliation');
    return data.data;
  },

  async listBankRows(params: Record<string, unknown> = {}): Promise<Paginated<BankTransaction>> {
    const { data } = await apiClient.get<{ success: boolean; data: Paginated<BankTransaction> }>(
      `/billing/reconciliation/batch/${encodeURIComponent(String(params.batchId ?? ''))}`,
      { params: { status: params.status, search: params.search, page: params.page, perPage: params.perPage } },
    );
    return data.data;
  },

  async manuallyMatch(bankTransactionId: string, ledgerTransactionId: string, note?: string) {
    const { data } = await apiClient.post<{ success: boolean; data: unknown }>(
      `/billing/reconciliation/${bankTransactionId}/match`,
      { ledgerTransactionId, note },
    );
    return data.data;
  },

  async unmatchBank(bankTransactionId: string) {
    const { data } = await apiClient.post<{ success: boolean; data: unknown }>(
      `/billing/reconciliation/${bankTransactionId}/unmatch`,
      {},
    );
    return data.data;
  },

  async setBankNotes(bankTransactionId: string, note: string) {
    await apiClient.patch(`/billing/reconciliation/${bankTransactionId}/notes`, { note });
  },

  async ignoreBank(bankTransactionId: string, ignored: boolean) {
    const { data } = await apiClient.patch<{ success: boolean; data: unknown }>(
      `/billing/reconciliation/${bankTransactionId}/ignored`,
      { ignored },
    );
    return data.data;
  },

  async importBankRows(rows: Record<string, unknown>[]) {
    const { data } = await apiClient.post<{ success: boolean; data: { imported: number; matchedAutomatically: number; batchId: string } }>(
      '/billing/reconciliation/import',
      { rows },
    );
    return data.data;
  },

  // ---- Report generation ----
  async getReport(reportType: ReportType, filters: Record<string, unknown> = {}): Promise<ReportResult> {
    const { data } = await apiClient.get<{ success: boolean; data: ReportResult }>(
      `/billing/reports/${reportType}`,
      { params: filters },
    );
    return data.data;
  },

  async downloadReportCsv(reportType: ReportType, filters: Record<string, unknown> = {}): Promise<Blob> {
    const { data } = await apiClient.get(`/billing/reports/${reportType}/csv`, {
      params: filters,
      responseType: 'blob',
    });
    return data;
  },

  // ---- Payment retry ----
  async retryPayment(transactionId: string) {
    const { data } = await apiClient.post<{ success: boolean; data: unknown }>(
      `/billing/payments/retry/${transactionId}`,
      {},
    );
    return data.data;
  },

  // ---- Invoice PDF ----
  async downloadInvoicePdf(invoiceId: string): Promise<Blob> {
    const { data } = await apiClient.get(`/billing/invoices/${invoiceId}/pdf`, {
      responseType: 'blob',
    });
    return data;
  },

  async getInvoicePdfHtml(invoiceId: string): Promise<string> {
    const { data } = await apiClient.get(`/billing/invoices/${invoiceId}/pdf/html`, {
      responseType: 'text',
    });
    return data;
  },

  // ---- Tax rates ----
  async listTaxRates(): Promise<{ items: TaxRate[] }> {
    const { data } = await apiClient.get<{ success: boolean; data: { items: TaxRate[] } }>('/billing/tax-rates');
    return data.data;
  },
  async createTaxRate(input: Record<string, unknown>) {
    const { data } = await apiClient.post<{ success: boolean; data: { taxRate: TaxRate } }>('/billing/tax-rates', input);
    return data.data;
  },
  async updateTaxRate(id: string, input: Record<string, unknown>) {
    const { data } = await apiClient.patch<{ success: boolean; data: { taxRate: TaxRate } }>(`/billing/tax-rates/${id}`, input);
    return data.data;
  },
  async setTaxRateActive(id: string, active: boolean) {
    const { data } = await apiClient.post<{ success: boolean; data: { taxRate: TaxRate } }>(`/billing/tax-rates/${id}/active`, { active });
    return data.data;
  },

  // ---- Recurring billing ----
  async listRecurringPlans(): Promise<{ items: RecurringPlan[] }> {
    const { data } = await apiClient.get<{ success: boolean; data: { items: RecurringPlan[] } }>('/billing/recurring');
    return data.data;
  },
  async createRecurringPlan(input: Record<string, unknown>) {
    const { data } = await apiClient.post<{ success: boolean; data: { plan: RecurringPlan } }>('/billing/recurring', input);
    return data.data;
  },
  async updateRecurringPlan(id: string, input: Record<string, unknown>) {
    const { data } = await apiClient.patch<{ success: boolean; data: { plan: RecurringPlan } }>(`/billing/recurring/${id}`, input);
    return data.data;
  },
  async setRecurringPlanStatus(id: string, status: string) {
    const { data } = await apiClient.post<{ success: boolean; data: { plan: RecurringPlan } }>(`/billing/recurring/${id}/status`, { status });
    return data.data;
  },
  async recurringPreview(id: string) {
    const { data } = await apiClient.get<{ success: boolean; data: { preview: RecurringInvoicePreview } }>(`/billing/recurring/${id}/preview`);
    return data.data;
  },
  async runRecurringSweep() {
    const { data } = await apiClient.post<{ success: boolean; data: { generated: string[]; skipped: string[] } }>('/billing/recurring/sweep', {});
    return data.data;
  },
// ---- Credit notes ----
  async listCreditNotes(): Promise<{ items: CreditNote[] }> {
    const { data } = await apiClient.get<{ success: boolean; data: { items: CreditNote[] } }>('/billing/credit-notes');
    return data.data;
  },
  async createCreditNote(input: Record<string, unknown>) {
    const { data } = await apiClient.post<{ success: boolean; data: { creditNote: CreditNote } }>('/billing/credit-notes', input);
    return data.data;
  },
  async issueCreditNote(id: string) {
    const { data } = await apiClient.post<{ success: boolean; data: unknown }>(`/billing/credit-notes/${id}/issue`, {});
    return data.data;
  },
  async cancelCreditNote(id: string) {
    const { data } = await apiClient.post<{ success: boolean; data: { creditNote: CreditNote } }>(`/billing/credit-notes/${id}/cancel`, {});
    return data.data;
  },

  // ---- Debit notes ----
  async listDebitNotes(): Promise<{ items: DebitNote[] }> {
    const { data } = await apiClient.get<{ success: boolean; data: { items: DebitNote[] } }>('/billing/debit-notes');
    return data.data;
  },
  async createDebitNote(input: Record<string, unknown>) {
    const { data } = await apiClient.post<{ success: boolean; data: { debitNote: DebitNote } }>('/billing/debit-notes', input);
    return data.data;
  },
  async issueDebitNote(id: string) {
    const { data } = await apiClient.post<{ success: boolean; data: unknown }>(`/billing/debit-notes/${id}/issue`, {});
    return data.data;
  },
  async cancelDebitNote(id: string) {
    const { data } = await apiClient.post<{ success: boolean; data: { debitNote: DebitNote } }>(`/billing/debit-notes/${id}/cancel`, {});
    return data.data;
  },
// ---- Approval workflow ----
  async listApprovals(): Promise<{ items: ApprovalRequest[] }> {
    const { data } = await apiClient.get<{ success: boolean; data: { items: ApprovalRequest[] } }>('/billing/approvals');
    return data.data;
  },
  async createApproval(input: Record<string, unknown>) {
    const { data } = await apiClient.post<{ success: boolean; data: { approval: ApprovalRequest } }>('/billing/approvals', input);
    return data.data;
  },
  async approveApproval(id: string) {
    const { data } = await apiClient.post<{ success: boolean; data: { approval: ApprovalRequest } }>(`/billing/approvals/${id}/approve`, {});
    return data.data;
  },
  async rejectApproval(id: string, reason?: string) {
    const { data } = await apiClient.post<{ success: boolean; data: { approval: ApprovalRequest } }>(`/billing/approvals/${id}/reject`, { reason });
    return data.data;
  },
  async cancelApproval(id: string) {
    const { data } = await apiClient.post<{ success: boolean; data: { approval: ApprovalRequest } }>(`/billing/approvals/${id}/cancel`, {});
    return data.data;
  },

  // ---- Financial periods ----
  async listFinancialPeriods(): Promise<{ items: FinancialPeriod[] }> {
    const { data } = await apiClient.get<{ success: boolean; data: { items: FinancialPeriod[] } }>('/billing/financial-periods');
    return data.data;
  },
  async createFinancialPeriod(input: Record<string, unknown>) {
    const { data } = await apiClient.post<{ success: boolean; data: { period: FinancialPeriod } }>('/billing/financial-periods', input);
    return data.data;
  },
  async closeFinancialPeriod(id: string) {
    const { data } = await apiClient.post<{ success: boolean; data: { period: FinancialPeriod } }>(`/billing/financial-periods/${id}/close`, {});
    return data.data;
  },
  async reopenFinancialPeriod(id: string) {
    const { data } = await apiClient.post<{ success: boolean; data: { period: FinancialPeriod } }>(`/billing/financial-periods/${id}/reopen`, {});
    return data.data;
  },
};