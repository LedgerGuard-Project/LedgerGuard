import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingService } from '../services/billing.service';
import { queryKeys } from '../lib/queryKeys';
import type { Customer, Paginated, ReportType } from '../types/billing';

export function useBillingSummary() {
  return useQuery({ queryKey: queryKeys.billingSummary, queryFn: () => billingService.summary(), staleTime: 60_000 });
}

export function useCustomers(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.customers.list(params),
    queryFn: () => billingService.listCustomers(params),
    placeholderData: (prev: Paginated<Customer> | undefined) => prev,
  });
}

export function useCustomer(customerId?: string) {
  return useQuery({
    queryKey: queryKeys.customer(customerId),
    queryFn: () => billingService.getCustomer(customerId!),
    enabled: Boolean(customerId),
  });
}

export function useInvoices(params?: Record<string, unknown>) {
  return useQuery({ queryKey: queryKeys.invoices.list(params), queryFn: () => billingService.listInvoices(params) });
}

export function useInvoice(invoiceId?: string) {
  return useQuery({
    queryKey: queryKeys.invoice(invoiceId),
    queryFn: () => billingService.getInvoice(invoiceId!),
    enabled: Boolean(invoiceId),
  });
}

export function usePayments(params?: Record<string, unknown>) {
  return useQuery({ queryKey: queryKeys.payments.list(params), queryFn: () => billingService.listPayments(params) });
}

export function useTransaction(transactionId?: string) {
  return useQuery({
    queryKey: queryKeys.transaction(transactionId),
    queryFn: () => billingService.getTransaction(transactionId!),
    enabled: Boolean(transactionId),
  });
}

export function useLedger(params?: Record<string, unknown>) {
  return useQuery({ queryKey: queryKeys.ledger.list(params), queryFn: () => billingService.listLedger(params) });
}

export function useAccounts(params?: Record<string, unknown>) {
  return useQuery({ queryKey: queryKeys.accounts.list(params), queryFn: () => billingService.listAccounts(params) });
}

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: billingService.listNotifications,
    refetchInterval: 60_000,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: billingService.createCustomer,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.customers.base }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<import('../services/billing.service').CreateCustomerInput> }) =>
      billingService.updateCustomer(id, input),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.customer(id) });
      qc.invalidateQueries({ queryKey: queryKeys.customers.base });
    },
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: billingService.createInvoice,
    onSuccess: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.billingSummary });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.base });
      qc.invalidateQueries({ queryKey: queryKeys.billingSummary });
    },
  });
}

export function useIssueInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate?: string }) => billingService.issueInvoice(id, dueDate),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoice(id) });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.base });
      qc.invalidateQueries({ queryKey: queryKeys.billingSummary });
    },
  });
}

export function useCancelInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: billingService.cancelInvoice,
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoice(id) });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.base });
      qc.invalidateQueries({ queryKey: queryKeys.billingSummary });
    },
  });
}

export function useMarkInvoicePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: billingService.markInvoicePaid,
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoice(id) });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.base });
      qc.invalidateQueries({ queryKey: queryKeys.billingSummary });
    },
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: billingService.createPayment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.base });
      qc.invalidateQueries({ queryKey: queryKeys.ledger.base });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.base });
      qc.invalidateQueries({ queryKey: queryKeys.billingSummary });
    },
  });
}

export function useRefundPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { amount: number; reference?: string; description?: string } }) =>
      billingService.refundPayment(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.base });
      qc.invalidateQueries({ queryKey: queryKeys.ledger.base });
      qc.invalidateQueries({ queryKey: queryKeys.billingSummary });
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: billingService.markNotificationRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: billingService.markAllNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

export function useReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repair: boolean) => billingService.reconcile(repair),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.billingSummary });
      qc.invalidateQueries({ queryKey: queryKeys.ledger.base });
      if (result?.run?.reconciliationId) {
        qc.invalidateQueries({ queryKey: queryKeys.reconciliation.base });
      }
    },
  });
}

export function useReconcileResult(key?: string) {
  return useQuery({
    queryKey: key ? queryKeys.reconciliation.byKey(key) : queryKeys.reconciliation.base,
    queryFn: () => billingService.getReconciliation(key!),
    enabled: Boolean(key),
  });
}

// ---- Bank reconciliation ----
export function useReconciliationDashboard() {
  return useQuery({
    queryKey: queryKeys.reconciliationDashboard,
    queryFn: () => billingService.reconciliationDashboard(),
  });
}

export function useBankRows(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.bankTransactions.list(params),
    queryFn: () => billingService.listBankRows(params),
    enabled: Boolean((params as { batchId?: string } | undefined)?.batchId),
  });
}

export function useManuallyMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ledgerId, note }: { id: string; ledgerId: string; note?: string }) =>
      billingService.manuallyMatch(id, ledgerId, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bankTransactions.base }),
  });
}

export function useUnmatchBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billingService.unmatchBank(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bankTransactions.base }),
  });
}

export function useSetBankNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => billingService.setBankNotes(id, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bankTransactions.base }),
  });
}

export function useIgnoreBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ignored }: { id: string; ignored: boolean }) => billingService.ignoreBank(id, ignored),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bankTransactions.base }),
  });
}

export function useImportBankRows() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: Record<string, unknown>[]) => billingService.importBankRows(rows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bankTransactions.base });
      qc.invalidateQueries({ queryKey: queryKeys.reconciliationDashboard });
    },
  });
}

export function useRetryPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transactionId: string) => billingService.retryPayment(transactionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.base });
      qc.invalidateQueries({ queryKey: queryKeys.ledger.base });
      qc.invalidateQueries({ queryKey: queryKeys.billingSummary });
    },
  });
}

export function useReport(reportType: ReportType, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: [queryKeys.report(reportType), filters ?? {}],
    queryFn: () => billingService.getReport(reportType, filters),
    staleTime: 30_000,
  });
}

// ---- Phase 2 hooks ----
export function useTaxRates() {
  return useQuery({ queryKey: queryKeys.taxRates, queryFn: () => billingService.listTaxRates() });
}
export function useCreateTaxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => billingService.createTaxRate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.taxRates }),
  });
}
export function useUpdateTaxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) => billingService.updateTaxRate(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.taxRates }),
  });
}
export function useSetTaxRateActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => billingService.setTaxRateActive(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.taxRates }),
  });
}

export function useRecurringPlans() {
  return useQuery({ queryKey: queryKeys.recurringPlans, queryFn: () => billingService.listRecurringPlans() });
}
export function useCreateRecurringPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => billingService.createRecurringPlan(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.recurringPlans }),
  });
}
export function useSetRecurringPlanStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => billingService.setRecurringPlanStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.recurringPlans }),
  });
}
export function useRunRecurringSweep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => billingService.runRecurringSweep(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.recurringPlans });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.base });
    },
  });
}
export function useCreditNotes() {
  return useQuery({ queryKey: queryKeys.creditNotes, queryFn: () => billingService.listCreditNotes() });
}
export function useCreateCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => billingService.createCreditNote(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.creditNotes }),
  });
}
export function useIssueCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billingService.issueCreditNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.creditNotes });
      qc.invalidateQueries({ queryKey: queryKeys.billingSummary });
    },
  });
}
export function useCancelCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billingService.cancelCreditNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.creditNotes }),
  });
}

export function useDebitNotes() {
  return useQuery({ queryKey: queryKeys.debitNotes, queryFn: () => billingService.listDebitNotes() });
}
export function useCreateDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => billingService.createDebitNote(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.debitNotes }),
  });
}
export function useIssueDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billingService.issueDebitNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.debitNotes });
      qc.invalidateQueries({ queryKey: queryKeys.billingSummary });
    },
  });
}
export function useCancelDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billingService.cancelDebitNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.debitNotes }),
  });
}
// ---- Invoice update (draft) ----
export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      billingService.updateInvoice(id, input),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoice(id) });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.base });
    },
  });
}

// ---- Recurring plan update + preview ----
export function useUpdateRecurringPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) => billingService.updateRecurringPlan(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.recurringPlans }),
  });
}

export function useRecurringPreview(planId: string) {
  return useQuery({
    queryKey: queryKeys.recurringPreview(planId),
    queryFn: () => billingService.recurringPreview(planId),
    staleTime: 30_000,
    enabled: Boolean(planId),
  });
}

// ---- Report CSV download ----
export function useReportCsvDownload() {
  return useMutation({
    mutationFn: ({ reportType, filters }: { reportType: ReportType; filters?: Record<string, unknown> }) =>
      billingService.downloadReportCsv(reportType, filters),
  });
}

// ---- Invoice PDF download ----
export function useDownloadInvoicePdf() {
  return useMutation({
    mutationFn: (invoiceId: string) => billingService.downloadInvoicePdf(invoiceId),
  });
}

// ---- Approval workflow ----
export function useApprovals() {
  const { data, ...rest } = useQuery({ queryKey: queryKeys.approvals, queryFn: () => billingService.listApprovals() });
  return { ...rest, approvals: data?.items ?? [] };
}

export function useCreateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => billingService.createApproval(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.approvals }),
  });
}

export function useApproveApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billingService.approveApproval(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.approvals }),
  });
}

export function useRejectApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => billingService.rejectApproval(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.approvals }),
  });
}

export function useCancelApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billingService.cancelApproval(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.approvals }),
  });
}

// ---- Financial periods ----
export function useFinancialPeriods() {
  const { data, ...rest } = useQuery({ queryKey: queryKeys.financialPeriods, queryFn: () => billingService.listFinancialPeriods() });
  return { ...rest, periods: data?.items ?? [] };
}

export function useCreateFinancialPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => billingService.createFinancialPeriod(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.financialPeriods }),
  });
}

export function useCloseFinancialPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billingService.closeFinancialPeriod(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.financialPeriods }),
  });
}

export function useReopenFinancialPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billingService.reopenFinancialPeriod(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.financialPeriods }),
  });
}