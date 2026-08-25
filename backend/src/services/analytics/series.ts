/**
 * Pure, dependency-free analytics calculations.
 *
 * Everything here is deterministic so it can be verified by the
 * `verify:analytics` script and reused by services without a database.
 * All money values are integer minor units; never mix currencies.
 */

export type Granularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

// ---------------------------------------------------------------- growth ----

/**
 * Period-over-period percentage change.
 * ((current - previous) / previous) * 100, safe when previous === 0.
 * When previous === 0: current > 0 → 100 (new revenue), otherwise 0 (no change).
 */
export function growthPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export type TrendDirection = 'up' | 'down' | 'flat';

export function trendDirection(growth: number, epsilon = 0.05): TrendDirection {
  if (growth > epsilon) return 'up';
  if (growth < -epsilon) return 'down';
  return 'flat';
}

// ------------------------------------------------------------- collection ---

/** Collection rate = collected / invoiced * 100, safe against divide-by-zero. */
export function collectionRate(collectedMinor: number, invoicedMinor: number): number {
  if (invoicedMinor <= 0) return 0;
  return Math.min(100, (collectedMinor / invoicedMinor) * 100);
}

// ------------------------------------------------------------------ aging ---

export interface AgingBucket {
  key: '0-30' | '31-60' | '61-90' | '90+';
  label: string;
  invoiceCount: number;
  outstandingMinor: number;
}

export const AGING_BUCKETS: AgingBucket[] = [
  { key: '0-30', label: '0–30 days', invoiceCount: 0, outstandingMinor: 0 },
  { key: '31-60', label: '31–60 days', invoiceCount: 0, outstandingMinor: 0 },
  { key: '61-90', label: '61–90 days', invoiceCount: 0, outstandingMinor: 0 },
  { key: '90+', label: '90+ days', invoiceCount: 0, outstandingMinor: 0 },
];

/** Bucket an overdue invoice by whole days past due. */
export function agingBucketForDaysOverdue(days: number): AgingBucket['key'] {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export function addToAging(
  buckets: AgingBucket[],
  daysOverdue: number,
  outstandingMinor: number,
): void {
  const key = agingBucketForDaysOverdue(Math.max(0, Math.floor(daysOverdue)));
  const bucket = buckets.find((b) => b.key === key) ?? buckets[buckets.length - 1];
  bucket.invoiceCount += 1;
  bucket.outstandingMinor += outstandingMinor;
}

// ------------------------------------------------------------------ series ---

export interface SeriesPoint {
  /** Bucket start, ISO date (or month key for monthly+). */
  key: string;
  label: string;
  value: number;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build an empty, ordered bucket skeleton covering [from, to) at granularity. */
export function buildBuckets(from: Date, to: Date, g: Granularity): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const cursor = new Date(from);
  let guard = 800;
  const stepMonths = g === 'monthly' ? 1 : g === 'quarterly' ? 3 : g === 'yearly' ? 12 : 0;
  while (cursor < to && guard-- > 0) {
    if (stepMonths > 0) {
      out.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        label: cursor.toLocaleDateString('en', { month: 'short', year: '2-digit' }),
        value: 0,
      });
      cursor.setMonth(cursor.getMonth() + stepMonths);
    } else {
      const stepDays = g === 'weekly' ? 7 : 1;
      const key = isoDay(cursor);
      out.push({ key, label: g === 'weekly' ? `W/C ${key}` : key, value: 0 });
      cursor.setDate(cursor.getDate() + stepDays);
    }
  }
  return out;
}

/** Bucket key for an arbitrary date at a granularity. */
export function bucketKeyForDate(d: Date, g: Granularity): string {
  switch (g) {
    case 'monthly':
    case 'quarterly':
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    case 'yearly':
      return String(d.getFullYear());
    case 'weekly':
    case 'daily':
    default:
      return d.toISOString().slice(0, 10);
  }
}

export function mergeIntoBuckets(buckets: SeriesPoint[], rows: Array<{ key: string; value: number }>): SeriesPoint[] {
  const map = new Map(buckets.map((b) => [b.key, b]));
  for (const row of rows) {
    const b = map.get(row.key);
    if (b) b.value += row.value;
  }
  return buckets;
}

// ------------------------------------------------------------ forecasting ---

export interface ForecastResult {
  history: SeriesPoint[];
  forecast: SeriesPoint[];
  method: 'weighted_moving_average' | 'linear_trend';
  /** Residual-based uncertainty band in the same units as values. */
  bandValue: number;
  dataPointsUsed: number;
  limitations: string[];
}

/**
 * Transparent statistical forecast.
 * - Steady series (n≥6, non-zero slope) → least-squares linear trend extrapolation.
 * - Short/noisy series → weighted moving average (recent points weigh more).
 * Values are ESTIMATES; callers must label them as such.
 */
export function forecastSeries(history: SeriesPoint[], horizonPoints: number): ForecastResult {
  const values = history.map((h) => h.value);
  const n = values.length;
  const nonZero = values.filter((v) => v !== 0).length;
  const limitations = [
    'Statistical estimate from historical aggregates — not a guarantee.',
    'Seasonality beyond the provided window is not modeled.',
    'Accuracy degrades with sparse or volatile history.',
  ];

  if (n < 3 || nonZero < 2) {
    return {
      history,
      forecast: [],
      method: 'weighted_moving_average',
      bandValue: 0,
      dataPointsUsed: n,
      limitations: ['Not enough historical data points to produce a forecast.', ...limitations],
    };
  }

  const ls = leastSquares(values);
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  const slopeSignificant = ls !== null && Math.abs(ls.slope) >= meanY * 0.005; // ≥0.5% per point
  if (n >= 6 && slopeSignificant && ls) {
    const residuals = values.map((v, i) => v - (ls.intercept + ls.slope * i));
    const band = stdDev(residuals) * 1.96;
    const forecast: SeriesPoint[] = [];
    for (let i = 0; i < horizonPoints; i++) {
      const idx = n + i;
      forecast.push({
        key: `f${i + 1}`,
        label: `+${i + 1}`,
        value: Math.max(0, Math.round(ls.intercept + ls.slope * idx)),
      });
    }
    return { history, forecast, method: 'linear_trend', bandValue: Math.round(band), dataPointsUsed: n, limitations };
  }

  const wma = weightedMovingAverage(values, Math.min(n, 7));
  const band = stdDev(values.slice(-Math.min(n, 14))) * 0.5;
  const forecast: SeriesPoint[] = [];
  for (let i = 0; i < horizonPoints; i++) {
    forecast.push({ key: `f${i + 1}`, label: `+${i + 1}`, value: Math.max(0, Math.round(wma)) });
  }
  return { history, forecast, method: 'weighted_moving_average', bandValue: Math.round(band), dataPointsUsed: n, limitations };
}

export function weightedMovingAverage(values: number[], window: number): number {
  const w = values.slice(-window);
  let num = 0;
  let den = 0;
  w.forEach((v, i) => {
    num += v * (i + 1);
    den += i + 1;
  });
  return den === 0 ? 0 : num / den;
}

/** Least squares over indices 0..n-1; null when degenerate. */
export function leastSquares(values: number[]): { intercept: number; slope: number } | null {
  const n = values.length;
  if (n < 2) return null;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  if (den === 0) return null;
  const slope = num / den;
  return { intercept: meanY - slope * meanX, slope };
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------- anomaly ---

export type AnomalySeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AnomalyKind =
  | 'large_transaction'
  | 'revenue_spike'
  | 'revenue_drop'
  | 'unusual_refund'
  | 'repeated_failures'
  | 'outstanding_increase';

export interface AnomalyCandidate {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  detectedAt: string;
  customerId?: string;
  amountMinor?: number;
  reason: string;
}

function severityFromZ(z: number): AnomalySeverity {
  if (z >= 6) return 'CRITICAL';
  if (z >= 4.5) return 'HIGH';
  if (z >= 3) return 'MEDIUM';
  if (z >= 2.5) return 'LOW';
  return 'INFO';
}

/**
 * Daily-value anomalies via trailing z-score (mean ± standard deviation).
 * Deterministic statistical rule — explicitly NOT machine learning.
 */
export function detectDailyAnomalies(
  daily: Array<{ date: string; value: number }>,
  opts: { minStdDev?: number; minBaselineCount?: number; zThreshold?: number } = {},
): AnomalyCandidate[] {
  const { minStdDev = 100_000, minBaselineCount = 5, zThreshold = 2.5 } = opts;
  if (daily.length < minBaselineCount + 1) return [];
  const out: AnomalyCandidate[] = [];

  for (let i = minBaselineCount; i < daily.length; i++) {
    const baseline = daily.slice(i - minBaselineCount, i).map((d) => d.value);
    const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const sd = stdDev(baseline);
    const point = daily[i];
    if (sd < minStdDev) continue;
    const z = sd === 0 ? 0 : (point.value - mean) / sd;
    if (Math.abs(z) < zThreshold) continue;
    const spike = z > 0;
    out.push({
      kind: spike ? 'revenue_spike' : 'revenue_drop',
      severity: severityFromZ(Math.abs(z)),
      detectedAt: new Date(`${point.date}T00:00:00Z`).toISOString(),
      amountMinor: point.value,
      reason: `Daily revenue ${point.value / 100} deviates ${Math.abs(z).toFixed(1)}σ from trailing ${minBaselineCount}-day mean (${(mean / 100).toFixed(0)} ± ${(sd / 100).toFixed(0)}).`,
    });
  }
  return out;
}

/** Individual transactions far above the peer median of the same type. */
export function detectOutlierTransactions(
  txs: Array<{ transactionId: string; amountMinor: number; customerId: string; createdAt: Date | string }>,
  opts: { medianMultiple?: number } = {},
): AnomalyCandidate[] {
  const { medianMultiple = 8 } = opts;
  if (txs.length < 5) return [];
  const sorted = txs.map((t) => t.amountMinor).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return [];
  const out: AnomalyCandidate[] = [];
  for (const t of txs) {
    if (t.amountMinor > median * medianMultiple && t.amountMinor > 10_000_00) {
      out.push({
        kind: 'large_transaction',
        severity: t.amountMinor > median * medianMultiple * 3 ? 'HIGH' : 'MEDIUM',
        detectedAt: new Date(t.createdAt).toISOString(),
        customerId: t.customerId,
        amountMinor: t.amountMinor,
        reason: `Transaction ${t.transactionId} is ${(t.amountMinor / median).toFixed(1)}× the median transaction size.`,
      });
    }
  }
  return out;
}

// --------------------------------------------------- customer health score ---

export type HealthBand = 'Healthy' | 'Watch' | 'At Risk';

export interface CustomerHealthInput {
  successRate: number; // 0..100
  outstandingMinor: number;
  avgInvoiceTotalMinor: number;
  failureCount: number;
  totalTransactions: number;
  revenueMinor: number;
}

export interface CustomerHealthScore {
  score: number; // 0..100
  band: HealthBand;
  reasons: string[];
}

/**
 * Transparent rule-based financial health classification (NOT a credit score).
 * Weights: consistency 40 · outstanding exposure 25 · failures 20 · activity 15.
 */
export function customerFinancialHealth(input: CustomerHealthInput): CustomerHealthScore {
  const reasons: string[] = [];
  let score = 100;

  const consistency = input.totalTransactions > 0 ? input.successRate : 60;
  score -= ((100 - consistency) / 100) * 40;
  if (consistency >= 95) reasons.push('Consistent payment history');
  else if (consistency < 75) reasons.push('Low payment success rate');

  const exposure = input.avgInvoiceTotalMinor > 0 ? input.outstandingMinor / input.avgInvoiceTotalMinor : 0;
  score -= Math.min(25, exposure * 12);
  if (exposure >= 2) reasons.push('High outstanding balance');
  else if (exposure > 0.5) reasons.push('Carrying an open balance');

  const failureRate = input.totalTransactions > 0 ? input.failureCount / input.totalTransactions : 0;
  score -= Math.min(20, failureRate * 150);
  if (input.failureCount >= 3) reasons.push('Frequent payment failures');

  if (input.revenueMinor <= 0) {
    score -= 15;
    reasons.push('No completed revenue in period');
  } else if (input.totalTransactions >= 4) {
    reasons.push('Active transaction volume');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band: HealthBand = score >= 80 ? 'Healthy' : score >= 55 ? 'Watch' : 'At Risk';
  if (reasons.length === 0) reasons.push('No risk indicators in period');
  return { score, band, reasons };
}

