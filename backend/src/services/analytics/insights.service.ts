import { createHash, randomUUID } from 'node:crypto';
import type { InsightCtx } from './insightCtx';
import { resolveRange, type RangeQuery } from './dates';
import * as S from './series';

/**
 * Phase 3 insights: statistical anomaly detection, transparent forecasting,
 * and the real-time activity feed. All rules are deterministic statistics
 * (z-score, median multiples, threshold counts) — no ML claims anywhere.
 */

// ---------------------------------------------------------------- anomalies --

function anomalyKey(tenantId: string, c: S.AnomalyCandidate): string {
  return createHash('sha1')
    .update(`${tenantId}|${c.kind}|${c.detectedAt}|${c.customerId ?? ''}|${c.amountMinor ?? 0}`)
    .digest('hex');
}

export interface DetectionSummary {
  detected: number;
  persisted: number;
  ranAt: string;
}

/** Run detection over the trailing 90 days and persist new candidates. */
export async function runAnomalyDetection(ctx: InsightCtx): Promise<DetectionSummary> {
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 86_400_000);
  const match = { tenantId: ctx.tenantId, createdAt: { $gte: from, $lt: to } };

  const dailyRows = await ctx.models.LedgerTransaction.aggregate([
    { $match: { ...match, type: 'charge', status: 'completed' } },
    { $project: { amountMinor: 1, d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
    { $group: { _id: '$d', value: { $sum: '$amountMinor' } } },
    { $sort: { _id: 1 } },
  ]);
  const candidates = S.detectDailyAnomalies(
    dailyRows.map((r) => ({ date: String(r._id), value: Number(r.value) })),
  );

  const chargeDocs = await ctx.models.LedgerTransaction.find(
    { ...match, type: 'charge', status: 'completed' },
    { transactionId: 1, amountMinor: 1, customerId: 1, createdAt: 1 },
  ).limit(2000).lean();
  candidates.push(
    ...S.detectOutlierTransactions(
      chargeDocs.map((t) => ({
        transactionId: t.transactionId,
        amountMinor: Number(t.amountMinor),
        customerId: t.customerId,
        createdAt: t.createdAt,
      })),
    ),
  );

  const failureRows = await ctx.models.LedgerTransaction.aggregate([
    { $match: { ...match, type: 'charge', status: 'failed' } },
    { $group: { _id: '$customerId', count: { $sum: 1 }, total: { $sum: '$amountMinor' } } },
    { $match: { count: { $gte: 3 } } },
  ]);
  for (const row of failureRows) {
    candidates.push({
      kind: 'repeated_failures',
      severity: row.count >= 6 ? 'HIGH' : 'MEDIUM',
      detectedAt: to.toISOString(),
      customerId: String(row._id),
      amountMinor: Number(row.total),
      reason: `${row.count} failed payment attempts within the last 90 days.`,
    });
  }

  let persisted = 0;
  for (const candidate of candidates) {
    const anomalyId = `ano_${anomalyKey(ctx.tenantId, candidate)}`;
    const exists = await ctx.extra.Anomaly.exists({ tenantId: ctx.tenantId, anomalyId });
    if (exists) continue;
    await ctx.extra.Anomaly.create({
      anomalyId,
      tenantId: ctx.tenantId,
      kind: candidate.kind,
      severity: candidate.severity,
      detectedAt: new Date(candidate.detectedAt),
      customerId: candidate.customerId,
      amountMinor: candidate.amountMinor,
      reason: candidate.reason,
    });
    persisted += 1;
  }
  return { detected: candidates.length, persisted, ranAt: new Date().toISOString() };
}

export async function listAnomalies(
  ctx: InsightCtx,
  opts: { status?: string; severity?: string; limit?: number },
): Promise<unknown[]> {
  const filter: Record<string, unknown> = { tenantId: ctx.tenantId };
  if (opts.status && ['open', 'reviewed', 'acknowledged', 'dismissed'].includes(opts.status)) {
    filter.status = opts.status;
  }
  if (opts.severity && ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(opts.severity)) {
    filter.severity = opts.severity;
  }
  return ctx.extra.Anomaly.find(filter).sort({ detectedAt: -1 }).limit(Math.min(200, opts.limit ?? 100)).lean();
}

export async function reviewAnomaly(
  ctx: InsightCtx,
  anomalyId: string,
  action: 'reviewed' | 'acknowledged' | 'dismissed',
): Promise<void> {
  await ctx.extra.Anomaly.updateOne(
    { tenantId: ctx.tenantId, anomalyId },
    { status: action, reviewedBy: ctx.userId, reviewedAt: new Date() },
  );
}

// ---------------------------------------------------------------- forecast ---

export async function forecast(ctx: InsightCtx, query: RangeQuery & { horizon?: number }) {
  const horizonDays = query.horizon === 30 ? 30 : query.horizon === 90 ? 90 : 7;
  const range = resolveRange({ preset: 'last_90_days' });
  const rows = await ctx.models.LedgerTransaction.aggregate([
    {
      $match: {
        tenantId: ctx.tenantId,
        type: 'charge',
        status: 'completed',
        createdAt: { $gte: range.from, $lt: range.to },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$amountMinor' },
        payments: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const revHistory = S.mergeIntoBuckets(
    S.buildBuckets(range.from, range.to, 'daily'),
    rows.map((r) => ({ key: String(r._id), value: Number(r.revenue) })),
  );
  const payHistory = S.mergeIntoBuckets(
    S.buildBuckets(range.from, range.to, 'daily'),
    rows.map((r) => ({ key: String(r._id), value: Number(r.payments) })),
  );

  const horizonPoints = Math.min(horizonDays, 90);
  const revenueForecast = S.forecastSeries(revHistory, horizonPoints);
  const paymentForecast = S.forecastSeries(payHistory, horizonPoints);

  return {
    currency: 'INR',
    horizonDays,
    revenue: {
      ...revenueForecast,
      estimatedTotalMinor: revenueForecast.forecast.reduce((a, p) => a + p.value, 0),
    },
    paymentVolume: {
      ...paymentForecast,
      estimatedTotal: paymentForecast.forecast.reduce((a, p) => a + p.value, 0),
    },
    disclaimer:
      `Values are statistical estimates computed with ${revenueForecast.method.replace(/_/g, ' ')}. They are not guarantees.`,
  };
}

// ------------------------------------------------------------ activity feed --

export interface ActivityItem {
  id: string;
  at: string;
  event: string;
  amountMinor?: number;
  customerId?: string;
  status?: string;
  description?: string;
}

export async function activityFeed(ctx: InsightCtx, limit = 40): Promise<ActivityItem[]> {
  const [txs, anomalies] = await Promise.all([
    ctx.models.LedgerTransaction.find(
      { tenantId: ctx.tenantId },
      { transactionId: 1, type: 1, status: 1, amountMinor: 1, customerId: 1, failureReason: 1, createdAt: 1 },
    )
      .sort({ createdAt: -1 })
      .limit(Math.min(60, limit))
      .lean(),
    ctx.extra.Anomaly.find(
      { tenantId: ctx.tenantId },
      { anomalyId: 1, kind: 1, severity: 1, amountMinor: 1, customerId: 1, detectedAt: 1 },
    )
      .sort({ detectedAt: -1 })
      .limit(10)
      .lean(),
  ]);

  const items: ActivityItem[] = txs.map((t) => ({
    id: t.transactionId,
    at: new Date(t.createdAt).toISOString(),
    event: `${t.type === 'refund' ? 'refund' : 'payment'}:${String(t.status)}`,
    amountMinor: Number(t.amountMinor),
    customerId: t.customerId,
    status: String(t.status),
    description: (t.failureReason as string | undefined) ?? undefined,
  }));
  for (const a of anomalies) {
    items.push({
      id: String(a.anomalyId),
      at: new Date(a.detectedAt).toISOString(),
      event: 'anomaly:detected',
      amountMinor: a.amountMinor != null ? Number(a.amountMinor) : undefined,
      customerId: (a.customerId as string) ?? undefined,
      status: String(a.severity),
      description: `Anomaly (${String(a.kind)}) detected`,
    });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// ------------------------------------------------------------- id generators --

export function newReportConfigId(): string {
  return `rc_${randomUUID()}`;
}

export function newExportId(): string {
  return `exp_${randomUUID()}`;
}