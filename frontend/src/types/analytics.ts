// Phase 3 analytics types — mirror the backend analytics service contracts.

export interface SeriesPoint {
  key: string;
  label: string;
  value: number;
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface Delta {
  pct: number;
  direction: TrendDirection;
  previous: number;
}

export interface OverviewKpis {
  currency: string;
  rangeLabel: string;
  grossRevenueMinor: number;
  netRevenueMinor: number;
  refundAmountMinor: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  paymentSuccessRate: number;
  avgTransactionValueMinor: number;
  outstandingReceivablesMinor: number;
  totalCustomers: number;
  newCustomers: number;
  deltas: Record<string, Delta>;
  revenueTrend: SeriesPoint[];
  hasData: boolean;
}

export interface RevenueIntel {
  currency: string;
  rangeLabel: string;
  grossRevenueMinor: number;
  netRevenueMinor: number;
  refundsMinor: number;
  discountsMinor: number;
  taxMinor: number;
  growthPct: number;
  avgRevenuePerCustomerMinor: number;
  avgTransactionValueMinor: number;
  hasData: boolean;
  trend: SeriesPoint[];
  byCustomer: Array<{ customerId: string; name?: string; total: number }>;
  byInvoice: Array<{ invoiceId: string; total: number }>;
}

export interface PaymentsIntel {
  currency: string;
  attempts: number;
  successful: number;
  failed: number;
  pending: number;
  rolledBack: number;
  refunded: number;
  refundedAmountMinor: number;
  successRate: number;
  failureRate: number;
  refundRate: number;
  avgPaymentAmountMinor: number;
  statusDist: Array<{ status: string; count: number; amountMinor: number }>;
  failureReasons: Array<{ reason: string; count: number; amountMinor: number }>;
  failuresByDate: Array<{ date: string; count: number; amountMinor: number }>;
  failuresByCustomer: Array<{ customerId: string; name?: string; count: number; amountMinor: number }>;
  volumeTrend: SeriesPoint[];
  refundTrend: SeriesPoint[];
  amountTrend?: SeriesPoint[];
  hasData: boolean;
}

export interface CustomerIntel {
  currency: string;
  total: number;
  newInPeriod: number;
  active: number;
  inactive: number;
  withOutstanding: number;
  avgRevenueMinor: number;
  topByRevenue: Array<{ customerId: string; name?: string; total: number }>;
  topByTransactions: Array<{ customerId: string; name?: string; count: number }>;
  topByOutstanding: Array<{ customerId: string; name?: string; outstandingMinor: number }>;
  concentration: Array<{ label: string; sharePct: number }>;
  healthScores: Array<{
    customerId: string;
    name?: string;
    score: number;
    band: string;
    reasons: string[];
    revenueMinor: number;
    outstandingMinor: number;
  }>;
  hasData: boolean;
}

export interface AgingBucket {
  key: string;
  label: string;
  invoiceCount: number;
  outstandingMinor: number;
}

export interface InvoiceIntel {
  currency: string;
  totalInvoices: number;
  paid: number;
  pending: number;
  partiallyPaid: number;
  overdue: number;
  cancelled: number;
  draft: number;
  invoicedMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  collectionRatePct: number;
  collectionTrend: SeriesPoint[];
  aging: AgingBucket[];
  amountTrend: SeriesPoint[];
  hasData: boolean;
}

export interface CashflowIntel {
  currency: string;
  moneyInMinor: number;
  refundsMinor: number;
  debitsMinor: number;
  creditsMinor: number;
  netCashFlowMinor: number;
  inflowTrend: SeriesPoint[];
  outflowTrend: SeriesPoint[];
  netTrend: SeriesPoint[];
  monthlyTable: Array<{ period: string; inMinor: number; outMinor: number; netMinor: number }>;
  hasData: boolean;
}

export interface HealthIndicator {
  name: string;
  value: number;
  unit: string;
  good: boolean | null;
  note: string;
}

export interface FinancialHealth {
  currency: string;
  status: string;
  score: number;
  reasons: string[];
  indicators: HealthIndicator[];
}

export interface ForecastResult {
  currency: string;
  horizonDays: number;
  revenue: {
    method: string;
    forecast: SeriesPoint[];
    estimatedTotalMinor: number;
    dataPointsUsed?: number;
  };
  paymentVolume: {
    method: string;
    forecast: SeriesPoint[];
    estimatedTotal: number;
    dataPointsUsed?: number;
  };
  disclaimer: string;
}

export interface AnomalyItem {
  anomalyId: string;
  kind: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detectedAt: string;
  customerId?: string;
  amountMinor: number;
  reason: string;
  status: string;
}

export interface ActivityItem {
  id: string;
  at: string;
  event: string;
  amountMinor?: number;
  customerId?: string;
  status?: string;
  description?: string;
}

export interface AlertRule {
  _id?: string;
  ruleId: string;
  name: string;
  metric: 'revenue_below' | 'outstanding_above' | 'failure_rate_above' | 'refund_above' | 'large_transaction';
  thresholdMinor: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
  tenantId?: string;
  createdBy?: string;
  createdAt?: string;
}

export interface SavedReport {
  _id?: string;
  reportConfigId: string;
  name: string;
  reportType: string;
  configuration: { preset?: string; from?: string; to?: string };
  createdAt?: string;
}

export interface ExportRecord {
  _id?: string;
  exportId: string;
  reportType: string;
  format: string;
  status: string;
  rowCount?: number;
  createdAt?: string;
}

export type RangeQuery = {
  preset?:
    | 'today'
    | 'yesterday'
    | 'last_7_days'
    | 'last_30_days'
    | 'last_90_days'
    | 'this_month'
    | 'last_month'
    | 'this_quarter'
    | 'this_year'
    | 'last_year';
  from?: string;
  to?: string;
  granularity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
};