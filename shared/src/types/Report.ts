export const REPORT_TYPES = [
  'revenue',
  'payment',
  'refund',
  'invoice',
  'outstanding_invoice',
  'ledger',
  'reconciliation',
  'tax',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportColumn {
  key: string;
  label: string;
}

/** A flat row of report data (values are strings/numbers/booleans). */
export interface ReportRow {
  [key: string]: string | number | boolean | null;
}

export interface ReportSummary {
  [key: string]: number;
}

export interface ReportResult {
  reportType: ReportType;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: ReportSummary;
  generatedAt: string;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  customerId?: string;
  status?: string;
  type?: string;
  reconciliationStatus?: string;
}