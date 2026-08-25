import type {
  ReportFilters,
  ReportResult,
  ReportRow,
  ReportColumn,
} from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import { fromMinor, roundMoney } from '../../utils/money';

function range(from?: string, to?: string) {
  const r: Record<string, Date> = {};
  if (from) r.$gte = new Date(from);
  if (to) r.$lte = new Date(to);
  return r;
}

function buildReport(
  reportType: ReportResult['reportType'],
  columns: ReportColumn[],
  rows: ReportRow[],
  summary: ReportResult['summary'],
): ReportResult {
  return { reportType, columns, rows, summary, generatedAt: new Date().toISOString() };
}

async function revenueReport(models: BillingModels, tenantId: string, f: ReportFilters): Promise<ReportResult> {
  const filter: Record<string, unknown> = { tenantId, type: 'charge', status: 'completed' };
  if (f.from || f.to) filter.createdAt = range(f.from, f.to);
  if (f.customerId) filter.customerId = f.customerId;
  const rows = await models.LedgerTransaction.find(filter).sort({ createdAt: -1 }).limit(500);
  return buildReport(
    'revenue',
    [
      { key: 'transactionId', label: 'Transaction' },
      { key: 'customerId', label: 'Customer' },
      { key: 'date', label: 'Date' },
      { key: 'amount', label: 'Amount' },
      { key: 'currency', label: 'Currency' },
    ],
    rows.map((t) => ({
      transactionId: t.transactionId,
      customerId: t.customerId,
      date: t.createdAt.toISOString(),
      amount: roundMoney(fromMinor(t.amountMinor)),
      currency: t.currency,
    })),
    { total: rows.reduce((a, t) => a + t.amountMinor, 0) },
  );
}

async function paymentReport(models: BillingModels, tenantId: string, f: ReportFilters): Promise<ReportResult> {
  const filter: Record<string, unknown> = { tenantId };
  if (f.from || f.to) filter.createdAt = range(f.from, f.to);
  if (f.customerId) filter.customerId = f.customerId;
  if (f.status) filter.status = f.status;
  const rows = await models.LedgerTransaction.find(filter).sort({ createdAt: -1 }).limit(500);
  return buildReport(
    'payment',
    [
      { key: 'transactionId', label: 'Transaction' },
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'amount', label: 'Amount' },
      { key: 'currency', label: 'Currency' },
      { key: 'failureReason', label: 'Failure reason' },
      { key: 'retryCount', label: 'Retries' },
    ],
    rows.map((t) => ({
      transactionId: t.transactionId,
      date: t.createdAt.toISOString(),
      type: t.type,
      status: t.status,
      amount: roundMoney(fromMinor(t.amountMinor)),
      currency: t.currency,
      failureReason: t.failureReason ?? null,
      retryCount: t.retryCount ?? 0,
    })),
    {
      total: rows.reduce((a, t) => a + t.amountMinor, 0),
      refunds: rows.filter((t) => t.type === 'refund').reduce((a, t) => a + t.amountMinor, 0),
      failed: rows.filter((t) => t.status === 'failed').length,
    },
  );
}

async function invoiceReport(models: BillingModels, tenantId: string, f: ReportFilters): Promise<ReportResult> {
  const filter: Record<string, unknown> = { tenantId };
  if (f.status) filter.status = f.status;
  if (f.customerId) filter.customerId = f.customerId;
  if (f.from || f.to) filter.issueDate = range(f.from, f.to);
  const rows = await models.Invoice.find(filter).sort({ issueDate: -1 }).limit(500);
  return buildReport(
    'invoice',
    [
      { key: 'invoiceNumber', label: 'Invoice' },
      { key: 'customerId', label: 'Customer' },
      { key: 'issueDate', label: 'Issue date' },
      { key: 'dueDate', label: 'Due date' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Total' },
      { key: 'currency', label: 'Currency' },
    ],
    rows.map((v) => ({
      invoiceNumber: v.invoiceNumber,
      customerId: v.customerId,
      issueDate: v.issueDate.toISOString(),
      dueDate: v.dueDate.toISOString(),
      status: v.status,
      total: roundMoney(fromMinor(v.totalMinor)),
      currency: v.currency,
    })),
    {
      total: rows.reduce((a, v) => a + v.totalMinor, 0),
      open: rows.filter((v) => ['issued', 'partially_paid', 'overdue'].includes(v.status)).reduce((a, v) => a + v.totalMinor, 0),
    },
  );
}

async function outstandingInvoiceReport(models: BillingModels, tenantId: string, f: ReportFilters): Promise<ReportResult> {
  const filter: Record<string, unknown> = { tenantId, status: { $in: ['issued', 'partially_paid', 'overdue'] } };
  if (f.customerId) filter.customerId = f.customerId;
  if (f.from || f.to) filter.dueDate = range(f.from, f.to);
  const rows = await models.Invoice.find(filter).sort({ dueDate: 1 }).limit(500);
  return buildReport(
    'outstanding_invoice',
    [
      { key: 'invoiceNumber', label: 'Invoice' },
      { key: 'customerId', label: 'Customer' },
      { key: 'dueDate', label: 'Due date' },
      { key: 'status', label: 'Status' },
      { key: 'outstanding', label: 'Outstanding' },
      { key: 'currency', label: 'Currency' },
    ],
    rows.map((v) => ({
      invoiceNumber: v.invoiceNumber,
      customerId: v.customerId,
      dueDate: v.dueDate.toISOString(),
      status: v.status,
      outstanding: roundMoney(fromMinor(v.totalMinor)),
      currency: v.currency,
    })),
    { total: rows.reduce((a, v) => a + v.totalMinor, 0) },
  );
}

async function refundReport(models: BillingModels, tenantId: string, f: ReportFilters): Promise<ReportResult> {
  const filter: Record<string, unknown> = { tenantId, type: 'refund', status: 'completed' };
  if (f.from || f.to) filter.createdAt = range(f.from, f.to);
  if (f.customerId) filter.customerId = f.customerId;
  const rows = await models.LedgerTransaction.find(filter).sort({ createdAt: -1 }).limit(500);
  return buildReport(
    'refund',
    [
      { key: 'transactionId', label: 'Refund' },
      { key: 'customerId', label: 'Customer' },
      { key: 'date', label: 'Date' },
      { key: 'amount', label: 'Amount' },
      { key: 'currency', label: 'Currency' },
    ],
    rows.map((t) => ({
      transactionId: t.transactionId,
      customerId: t.customerId,
      date: t.createdAt.toISOString(),
      amount: roundMoney(fromMinor(t.amountMinor)),
      currency: t.currency,
    })),
    { total: rows.reduce((a, t) => a + t.amountMinor, 0) },
  );
}

async function ledgerReport(models: BillingModels, tenantId: string, f: ReportFilters): Promise<ReportResult> {
  const filter: Record<string, unknown> = { tenantId };
  if (f.type) filter.type = f.type;
  if (f.status) filter.status = f.status;
  if (f.customerId) filter.customerId = f.customerId;
  if (f.from || f.to) filter.createdAt = range(f.from, f.to);
  const rows = await models.LedgerTransaction.find(filter).sort({ createdAt: -1 }).limit(500);
  return buildReport(
    'ledger',
    [
      { key: 'transactionId', label: 'Transaction' },
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'amount', label: 'Amount' },
      { key: 'currency', label: 'Currency' },
    ],
    rows.map((t) => ({
      transactionId: t.transactionId,
      date: t.createdAt.toISOString(),
      type: t.type,
      status: t.status,
      amount: roundMoney(fromMinor(t.amountMinor)),
      currency: t.currency,
    })),
    { total: rows.reduce((a, t) => a + t.amountMinor, 0) },
  );
}

async function reconciliationReport(models: BillingModels, tenantId: string, f: ReportFilters): Promise<ReportResult> {
  const filter: Record<string, unknown> = { tenantId };
  if (f.reconciliationStatus) filter.status = f.reconciliationStatus;
  const rows = await models.BankTransaction.find(filter).sort({ transactionDate: -1 }).limit(500);
  return buildReport(
    'reconciliation',
    [
      { key: 'bankTransactionId', label: 'Bank ref' },
      { key: 'date', label: 'Date' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount' },
      { key: 'currency', label: 'Currency' },
      { key: 'status', label: 'Status' },
      { key: 'ledgerTransactionId', label: 'Matched ledger txn' },
    ],
    rows.map((b) => ({
      bankTransactionId: b.bankTransactionId,
      date: b.transactionDate.toISOString(),
      description: b.description ?? null,
      amount: roundMoney(fromMinor(b.amountMinor)),
      currency: b.currency,
      status: b.status,
      ledgerTransactionId: b.ledgerTransactionId ?? null,
    })),
    {
      total: rows.reduce((a, b) => a + b.amountMinor, 0),
      matched: rows.filter((b) => ['matched', 'manually_matched'].includes(b.status)).length,
      unmatched: rows.filter((b) => b.status === 'unmatched').length,
    },
  );
}

async function taxReport(models: BillingModels, tenantId: string, f: ReportFilters): Promise<ReportResult> {
  const filter: Record<string, unknown> = { tenantId, taxMinor: { $gt: 0 } };
  if (f.from || f.to) filter.issueDate = range(f.from, f.to);
  if (f.customerId) filter.customerId = f.customerId;
  if (f.status) filter.status = f.status;
  const rows = await models.Invoice.find(filter).sort({ issueDate: -1 }).limit(500);
  return buildReport(
    'tax',
    [
      { key: 'invoiceNumber', label: 'Invoice' },
      { key: 'customerId', label: 'Customer' },
      { key: 'issueDate', label: 'Issue date' },
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'taxRateId', label: 'Tax rate id' },
      { key: 'tax', label: 'Tax' },
      { key: 'total', label: 'Total' },
    ],
    rows.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId,
      issueDate: inv.issueDate.toISOString().slice(0, 10),
      jurisdiction: inv.taxJurisdiction ?? null,
      taxRateId: inv.taxRateId ?? null,
      tax: roundMoney(fromMinor(inv.taxMinor)),
      total: roundMoney(fromMinor(inv.totalMinor)),
    })),
    { tax: rows.reduce((a, inv) => a + inv.taxMinor, 0) },
  );
}

export async function generateReport(
  models: BillingModels,
  tenantId: string,
  reportType: ReportResult['reportType'],
  filters: ReportFilters = {},
): Promise<ReportResult> {
  switch (reportType) {
    case 'revenue':
      return revenueReport(models, tenantId, filters);
    case 'payment':
      return paymentReport(models, tenantId, filters);
    case 'refund':
      return refundReport(models, tenantId, filters);
    case 'invoice':
      return invoiceReport(models, tenantId, filters);
    case 'outstanding_invoice':
      return outstandingInvoiceReport(models, tenantId, filters);
    case 'ledger':
      return ledgerReport(models, tenantId, filters);
    case 'reconciliation':
      return reconciliationReport(models, tenantId, filters);
    case 'tax':
      return taxReport(models, tenantId, filters);
  }
}

export function rowsToCsv(columns: ReportColumn[], rows: ReportRow[]): string {
  const header = columns.map((c) => escapeCsv(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCsv(String(r[c.key] ?? ''))).join(','));
  return [header, ...body].join('\n');
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function reportToHtml(result: ReportResult): string {
  const head = result.columns.map((c) => `<th>${c.label}</th>`).join('');
  const body = result.rows
    .map((r) => `<tr>${result.columns.map((c) => `<td>${String(r[c.key] ?? '')}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="rep"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}