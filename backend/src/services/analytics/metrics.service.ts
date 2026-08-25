import type { BillingModels } from '../../models/billing';
import { resolveRange, type AnalyticsRange, type RangeQuery } from './dates';
import * as S from './series';
import { cachedAnalytics } from './cache';

/**
 * Phase 3 analytics metrics.
 *
 * Every number is aggregated inside MongoDB ($match/$group/$project) from the
 * tenant's own collections — never fetched wholesale into Node. Revenue rules
 * follow the Phase 2 ledger contract: only `charge` transactions with status
 * `completed` count as revenue; failed/rolled-back/pending never do.
 */

type Granularity = S.Granularity;

export interface Ctx {
  models: BillingModels;
  tenantId: string;
}

/** Dominant currency for the tenant (most completed charges all-time). */
async function dominantCurrency(ctx: Ctx): Promise<string> {
  const res = await ctx.models.LedgerTransaction.aggregate([
    { $match: { tenantId: ctx.tenantId, type: 'charge', status: 'completed' } },
    { $group: { _id: '$currency', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 1 },
  ]);
  return res[0]?._id ?? 'INR';
}

function rangeWindow(range: AnalyticsRange, previous = false) {
  return {
    createdAt: { $gte: previous ? range.prevFrom : range.from, $lt: previous ? range.prevTo : range.to },
  };
}

async function sumTx(ctx: Ctx, match: Record<string, unknown>): Promise<{ total: number; count: number }> {
  const res = await ctx.models.LedgerTransaction.aggregate([
    { $match: { tenantId: ctx.tenantId, ...match } },
    { $group: { _id: null, total: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
  ]);
  return { total: res[0]?.total ?? 0, count: res[0]?.count ?? 0 };
}

export function successRate(successCount: number, failedCount: number): number {
  const total = successCount + failedCount;
  if (total === 0) return 0;
  return Math.round((successCount / total) * 1000) / 10;
}

function delta(current: number, previous: number) {
  const pct = S.growthPct(current, previous);
  return { pct: Math.round(pct * 10) / 10, direction: S.trendDirection(pct), previous };
}

async function openInvoicesTotal(ctx: Ctx): Promise<number> {
  const res = await ctx.models.Invoice.aggregate([
    { $match: { tenantId: ctx.tenantId, status: { $in: ['issued', 'partially_paid', 'overdue'] } } },
    { $group: { _id: null, total: { $sum: '$totalMinor' } } },
  ]);
  return res[0]?.total ?? 0;
}

/** Group transactions by time bucket with server-side $year/$month/$dayOfMonth. */
export function buildSeriesPipeline(
  window: Record<string, unknown>,
  extraMatch: Record<string, unknown>,
  g: Granularity,
): Array<Record<string, unknown>> {
  const dateParts: Record<string, string> = { y: '$y', m: '$m' };
  if (g === 'daily' || g === 'weekly') dateParts.d = '$d';
  const mm = { $substrCP: [{ $toString: { $add: ['$_id.m', 100] } }, 1, 2] };
  const key =
    g === 'daily' || g === 'weekly'
      ? { $concat: [{ $toString: '$_id.y' }, '-', mm, '-', { $substrCP: [{ $toString: { $add: ['$_id.d', 100] } }, 1, 2] }] }
      : { $concat: [{ $toString: '$_id.y' }, '-', mm] };

  return [
    { $match: { ...extraMatch, createdAt: window } },
    {
      $project: {
        amountMinor: 1,
        y: { $year: '$createdAt' },
        m: { $month: '$createdAt' },
        ...(g === 'daily' || g === 'weekly' ? { d: { $dayOfMonth: '$createdAt' } } : {}),
      },
    },
    { $group: { _id: dateParts, value: { $sum: '$amountMinor' } } },
    { $project: { _id: 0, key, value: 1 } },
    { $sort: { key: 1 } },
  ];
}

async function seriesFor(
  ctx: Ctx,
  match: Record<string, unknown>,
  range: AnalyticsRange,
  g: Granularity,
): Promise<S.SeriesPoint[]> {
  const buckets = S.buildBuckets(range.from, range.to, g);
  const pipeline = buildSeriesPipeline(rangeWindow(range), match, g);
  const rows = (await ctx.models.LedgerTransaction.aggregate(
    pipeline as unknown as Parameters<typeof ctx.models.LedgerTransaction.aggregate>[0],
  )) as Array<{ key: string; value: number }>;
  return S.mergeIntoBuckets(buckets, rows);
}

// ---------------------------------------------------------------- overview ---

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
  deltas: Record<string, { pct: number; direction: S.TrendDirection; previous: number }>;
  revenueTrend: S.SeriesPoint[];
  hasData: boolean;
}

const COMPLETED_CHARGE = { type: 'charge', status: 'completed' };
const COMPLETED_REFUND = { type: 'refund', status: 'completed' };

export async function overview(ctx: Ctx, query: RangeQuery): Promise<OverviewKpis> {
  const range = resolveRange(query);
  const currency = await dominantCurrency(ctx);
  const cur = { currency };

  const load = async () => {
    const [gross, prevGross, refunds, successFul, prevSuccessful, failed, prevFailed, pending, outstanding, totalCustomers, newCustomers] =
      await Promise.all([
        sumTx(ctx, { ...COMPLETED_CHARGE, ...cur, ...rangeWindow(range) }),
        sumTx(ctx, { ...COMPLETED_CHARGE, ...cur, ...rangeWindow(range, true) }),
        sumTx(ctx, { ...COMPLETED_REFUND, ...cur, ...rangeWindow(range) }),
        sumTx(ctx, { ...COMPLETED_CHARGE, ...cur, ...rangeWindow(range) }),
        sumTx(ctx, { ...COMPLETED_CHARGE, ...cur, ...rangeWindow(range, true) }),
        sumTx(ctx, { type: 'charge', status: { $in: ['failed', 'rolled_back'] }, ...cur, ...rangeWindow(range) }),
        sumTx(ctx, { type: 'charge', status: { $in: ['failed', 'rolled_back'] }, ...cur, ...rangeWindow(range, true) }),
        sumTx(ctx, { type: 'charge', status: { $in: ['pending', 'processing'] }, ...cur }),
        openInvoicesTotal(ctx),
        ctx.models.Customer.countDocuments({ tenantId: ctx.tenantId }),
        ctx.models.Customer.countDocuments({ tenantId: ctx.tenantId, ...rangeWindow(range) }),
      ]);
    const net = Math.max(0, gross.total - refunds.total);
    const prevNet = Math.max(0, prevGross.total - 0);
    return {
      grossRevenueMinor: gross.total,
      netRevenueMinor: net,
      refundAmountMinor: refunds.total,
      successfulPayments: successFul.count,
      failedPayments: failed.count,
      pendingPayments: pending.count,
      paymentSuccessRate: successRate(successFul.count, failed.count),
      avgTransactionValueMinor: successFul.count > 0 ? Math.round(successFul.total / successFul.count) : 0,
      outstandingReceivablesMinor: outstanding,
      totalCustomers,
      newCustomers,
      hasData: gross.total > 0 || successFul.count > 0 || totalCustomers > 0,
      deltas: {
        grossRevenue: delta(gross.total, prevGross.total),
        netRevenue: delta(net, Math.max(0, prevNet - 0)),
        successfulPayments: delta(successFul.count, prevSuccessful.count),
        failedPayments: delta(failed.count, prevFailed.count),
      },
    };
  };

  const data = await cachedAnalytics(ctx.models, ctx.tenantId, 'overview', range, {}, load);
  const revenueTrend = await seriesFor(ctx, { ...COMPLETED_CHARGE, currency }, range, range.granularity);
  return { currency, rangeLabel: range.label, revenueTrend, ...data };
}

// ----------------------------------------------------------------- revenue ---

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
  trend: S.SeriesPoint[];
  byCustomer: Array<{ customerId: string; name?: string; total: number }>;
  byInvoice: Array<{ invoiceId: string; total: number }>;
  hasData: boolean;
}

export async function revenue(ctx: Ctx, query: RangeQuery): Promise<RevenueIntel> {
  const range = resolveRange(query);
  const currency = await dominantCurrency(ctx);
  const cur = { currency };
  const win = rangeWindow(range);

  const load = async () => {
    const [gross, prevGross, refunds, invoiceAgg, custIds] = await Promise.all([
      sumTx(ctx, { ...COMPLETED_CHARGE, ...cur, ...win }),
      sumTx(ctx, { ...COMPLETED_CHARGE, ...cur, ...rangeWindow(range, true) }),
      sumTx(ctx, { ...COMPLETED_REFUND, ...cur, ...win }),
      ctx.models.Invoice.aggregate([
        { $match: { tenantId: ctx.tenantId, currency, createdAt: win.createdAt } },
        { $group: { _id: null, tax: { $sum: '$taxMinor' }, discount: { $sum: '$discountMinor' } } },
      ]),
      ctx.models.LedgerTransaction.distinct('customerId', { tenantId: ctx.tenantId, ...COMPLETED_CHARGE, ...cur, ...win.createdAt }),
    ]);
    const topCustomers = await ctx.models.LedgerTransaction.aggregate([
      { $match: { tenantId: ctx.tenantId, ...COMPLETED_CHARGE, currency, createdAt: win.createdAt } },
      { $group: { _id: '$customerId', total: { $sum: '$amountMinor' } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]);
    const names = await customerNames(ctx, topCustomers.map((c) => c._id as string));
    const topInvoices = await ctx.models.LedgerTransaction.aggregate([
      { $match: { tenantId: ctx.tenantId, ...COMPLETED_CHARGE, currency, invoiceId: { $exists: true, $ne: null }, createdAt: win.createdAt } },
      { $group: { _id: '$invoiceId', total: { $sum: '$amountMinor' } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, invoiceId: '$_id', total: 1 } },
    ]);
    const inv = invoiceAgg[0] ?? { tax: 0, discount: 0 };
    return {
      grossRevenueMinor: gross.total,
      netRevenueMinor: Math.max(0, gross.total - refunds.total),
      refundsMinor: refunds.total,
      discountsMinor: inv.discount,
      taxMinor: inv.tax,
      growthPct: Math.round(S.growthPct(gross.total, prevGross.total) * 10) / 10,
      avgRevenuePerCustomerMinor: custIds.length > 0 ? Math.round(gross.total / custIds.length) : 0,
      avgTransactionValueMinor: gross.count > 0 ? Math.round(gross.total / gross.count) : 0,
      hasData: gross.total > 0 || custIds.length > 0,
      byCustomer: topCustomers.map((c) => ({ customerId: c._id as string, name: names.get(c._id as string), total: c.total })),
      byInvoice: topInvoices,
    };
  };

  const data = await cachedAnalytics(ctx.models, ctx.tenantId, 'revenue', range, {}, load);
  const trend = await seriesFor(ctx, { ...COMPLETED_CHARGE, currency }, range, range.granularity);
  return { currency, rangeLabel: range.label, trend, ...data };
}

async function customerNames(ctx: Ctx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const docs = await ctx.models.Customer.find({ tenantId: ctx.tenantId, customerId: { $in: ids } })
    .select({ customerId: 1, name: 1 })
    .lean();
  return new Map(docs.map((d) => [d.customerId as string, d.name as string]));
}

// ---------------------------------------------------------------- payments ---

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
  volumeTrend: S.SeriesPoint[];
  failureReasons: Array<{ reason: string; count: number; amountMinor: number }>;
  failuresByDate: Array<{ date: string; count: number; amountMinor: number }>;
  failuresByCustomer: Array<{ customerId: string; name?: string; count: number; amountMinor: number }>;
  refundTrend: S.SeriesPoint[];
  hasData: boolean;
}

export async function payments(ctx: Ctx, query: RangeQuery): Promise<PaymentsIntel> {
  const range = resolveRange(query);
  const currency = await dominantCurrency(ctx);
  const cur = { currency };
  const win = rangeWindow(range);

  const load = async () => {
    const distRows = await ctx.models.LedgerTransaction.aggregate([
      { $match: { tenantId: ctx.tenantId, type: 'charge', currency, createdAt: win.createdAt } },
      { $group: { _id: '$status', count: { $sum: 1 }, amountMinor: { $sum: '$amountMinor' } } },
    ]);
    const byStatus = new Map(distRows.map((r) => [String(r._id), r]));
    const get = (s: string) => ({ count: byStatus.get(s)?.count ?? 0, amountMinor: byStatus.get(s)?.amountMinor ?? 0 });
    const success = get('completed');
    const failedCount = (byStatus.get('failed')?.count ?? 0) + (byStatus.get('rolled_back')?.count ?? 0);
    const refunded = await sumTx(ctx, { ...COMPLETED_REFUND, ...cur, ...win });
    const attempts = distRows.reduce((acc, r) => acc + Number(r.count), 0);

    const failureReasons = await ctx.models.LedgerTransaction.aggregate([
      { $match: { tenantId: ctx.tenantId, type: 'charge', status: 'failed', currency, createdAt: win.createdAt } },
      { $group: { _id: { $ifNull: ['$failureReason', 'Unknown'] }, count: { $sum: 1 }, amountMinor: { $sum: '$amountMinor' } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
      { $project: { _id: 0, reason: '$_id', count: 1, amountMinor: 1 } },
    ]);
    const failuresByDate = await ctx.models.LedgerTransaction.aggregate([
      { $match: { tenantId: ctx.tenantId, type: 'charge', status: 'failed', currency, createdAt: win.createdAt } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, amountMinor: { $sum: '$amountMinor' } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1, amountMinor: 1 } },
    ]);
    const failCustRows = await ctx.models.LedgerTransaction.aggregate([
      { $match: { tenantId: ctx.tenantId, type: 'charge', status: 'failed', currency, createdAt: win.createdAt } },
      { $group: { _id: '$customerId', count: { $sum: 1 }, amountMinor: { $sum: '$amountMinor' } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);
    const failNames = await customerNames(ctx, failCustRows.map((c) => c._id as string));
    void cur;

    return {
      attempts,
      successful: success.count,
      failed: failedCount,
      pending: (byStatus.get('pending')?.count ?? 0) + (byStatus.get('processing')?.count ?? 0),
      rolledBack: byStatus.get('rolled_back')?.count ?? 0,
      refunded: refunded.count,
      refundedAmountMinor: refunded.total,
      successRate: successRate(success.count, failedCount),
      failureRate: successRate(failedCount, success.count),
      refundRate: success.count > 0 ? Math.round((refunded.count / success.count) * 1000) / 10 : 0,
      avgPaymentAmountMinor: success.count > 0 ? Math.round(success.amountMinor / success.count) : 0,
      statusDist: [...byStatus.entries()].map(([status, r]) => ({ status, count: r.count, amountMinor: r.amountMinor })),
      failureReasons,
      failuresByDate,
      failuresByCustomer: failCustRows.map((c) => ({
        customerId: c._id as string,
        name: failNames.get(c._id as string),
        count: c.count,
        amountMinor: c.amountMinor,
      })),
      hasData: attempts > 0 || refunded.count > 0,
    };
  };

  const data = await cachedAnalytics(ctx.models, ctx.tenantId, 'payments', range, {}, load);
  const [volumeTrend, refundTrend] = await Promise.all([
    seriesFor(ctx, { type: 'charge', currency }, range, range.granularity),
    seriesFor(ctx, { ...COMPLETED_REFUND, currency }, range, range.granularity),
  ]);
  return { currency, volumeTrend, refundTrend, ...data };
}

// --------------------------------------------------------------- customers ---

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
    band: S.HealthBand;
    reasons: string[];
    revenueMinor: number;
    outstandingMinor: number;
  }>;
  hasData: boolean;
}

export async function customers(ctx: Ctx, query: RangeQuery): Promise<CustomerIntel> {
  const range = resolveRange(query);
  const currency = await dominantCurrency(ctx);
  const win = rangeWindow(range);

  const load = async () => {
    const [total, newInPeriod] = await Promise.all([
      ctx.models.Customer.countDocuments({ tenantId: ctx.tenantId }),
      ctx.models.Customer.countDocuments({ tenantId: ctx.tenantId, ...win }),
    ]);

    const perCustomer = await ctx.models.LedgerTransaction.aggregate([
      { $match: { tenantId: ctx.tenantId, type: 'charge', currency, createdAt: win.createdAt } },
      {
        $group: {
          _id: '$customerId',
          revenueMinor: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amountMinor', 0] } },
          completedCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          failedCount: { $sum: { $cond: [{ $in: ['$status', ['failed', 'rolled_back']] }, 1, 0] } },
          attempts: { $sum: 1 },
        },
      },
    ]);
    const byId = new Map(perCustomer.map((r) => [String(r._id), r]));
    const activeIds = perCustomer.filter((r) => r.completedCount > 0).map((r) => String(r._id));
    const names = await customerNames(ctx, perCustomer.map((r) => String(r._id)));

    const outstandingRows = await ctx.models.Invoice.aggregate([
      { $match: { tenantId: ctx.tenantId, status: { $in: ['issued', 'partially_paid', 'overdue'] }, currency } },
      { $group: { _id: '$customerId', outstandingMinor: { $sum: '$totalMinor' } } },
      { $sort: { outstandingMinor: -1 } },
      { $limit: 10 },
    ]);
    const outNames = await customerNames(ctx, outstandingRows.map((c) => c._id as string));

    // Revenue concentration: share of revenue held by top customers.
    const totalRevenue = perCustomer.reduce((a, r) => a + Number(r.revenueMinor), 0);
    const sorted = [...perCustomer].sort((a, b) => Number(b.revenueMinor) - Number(a.revenueMinor));
    const shareOf = (k: number) =>
      totalRevenue > 0 ? Math.round((sorted.slice(0, k).reduce((a, r) => a + Number(r.revenueMinor), 0) / totalRevenue) * 1000) / 10 : 0;
    const restShare = Math.max(0, Math.round((100 - shareOf(Math.min(10, sorted.length))) * 10) / 10);

    // Health scores for the top-20 revenue customers.
    const invoiceAvgRows = await ctx.models.Invoice.aggregate([
      { $match: { tenantId: ctx.tenantId, currency } },
      { $group: { _id: null, avg: { $avg: '$totalMinor' } } },
    ]);
    const avgInvoice = invoiceAvgRows[0]?.avg ?? 0;
    const outstandingByCust = new Map(outstandingRows.map((r) => [String(r._id), Number(r.outstandingMinor)]));
    const healthTargets = sorted.slice(0, 20);
    const healthScores = healthTargets.map((r) => {
      const successRate = Number(r.attempts) > 0 ? (Number(r.completedCount) / Number(r.attempts)) * 100 : 60;
      const health = S.customerFinancialHealth({
        successRate,
        outstandingMinor: outstandingByCust.get(String(r._id)) ?? 0,
        avgInvoiceTotalMinor: avgInvoice,
        failureCount: Number(r.failedCount),
        totalTransactions: Number(r.attempts),
        revenueMinor: Number(r.revenueMinor),
      });
      return {
        customerId: String(r._id),
        name: names.get(String(r._id)),
        ...health,
        revenueMinor: Number(r.revenueMinor),
        outstandingMinor: outstandingByCust.get(String(r._id)) ?? 0,
      };
    });

    const topRevenue = [...healthTargets].sort((a, b) => Number(b.revenueMinor) - Number(a.revenueMinor)).slice(0, 8);

    return {
      currency,
      total,
      newInPeriod,
      active: activeIds.length,
      inactive: Math.max(0, total - activeIds.length),
      withOutstanding: outstandingRows.length,
      avgRevenueMinor: activeIds.length > 0 ? Math.round(totalRevenue / activeIds.length) : 0,
      topByRevenue: topRevenue.map((r) => ({ customerId: String(r._id), name: names.get(String(r._id)), total: Number(r.revenueMinor) })),
      topByTransactions: [...perCustomer]
        .sort((a, b) => Number(b.completedCount) - Number(a.completedCount))
        .slice(0, 8)
        .map((r) => ({ customerId: String(r._id), name: names.get(String(r._id)), count: Number(r.completedCount) })),
      topByOutstanding: outstandingRows.map((r) => ({
        customerId: String(r._id),
        name: outNames.get(String(r._id)),
        outstandingMinor: Number(r.outstandingMinor),
      })),
      concentration: [
        { label: 'Top 1', sharePct: shareOf(1) },
        { label: 'Top 3', sharePct: shareOf(3) },
        { label: 'Top 5', sharePct: shareOf(5) },
        { label: 'Top 10', sharePct: shareOf(10) },
        { label: 'Others', sharePct: restShare },
      ],
      healthScores,
      hasData: total > 0 || totalRevenue > 0,
    };
  };

  return cachedAnalytics(ctx.models, ctx.tenantId, 'customers', range, {}, load);
}

// --------------------------------------------------------------- invoices ---

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
  collectionTrend: S.SeriesPoint[];
  aging: S.AgingBucket[];
  amountTrend: S.SeriesPoint[];
  hasData: boolean;
}

export async function invoices(ctx: Ctx, query: RangeQuery): Promise<InvoiceIntel> {
  const range = resolveRange(query);
  const currency = await dominantCurrency(ctx);

  const load = async () => {
    const statusRows = await ctx.models.Invoice.aggregate([
      { $match: { tenantId: ctx.tenantId, currency } },
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalMinor' } } },
    ]);
    const by = new Map(statusRows.map((r) => [String(r._id), r]));
    const get = (s: string) => ({ count: by.get(s)?.count ?? 0, total: by.get(s)?.total ?? 0 });
    const openStatuses = ['issued', 'partially_paid', 'overdue'];
    const invoicedMinor = statusRows
      .filter((r) => String(r._id) !== 'draft' && String(r._id) !== 'cancelled')
      .reduce((a, r) => a + Number(r.total), 0);
    const outstandingMinor = openStatuses.reduce((a, s) => a + get(s).total, 0);
    const collectedRows = await ctx.models.LedgerTransaction.aggregate([
      { $match: { tenantId: ctx.tenantId, type: 'charge', status: 'completed', currency } },
      { $group: { _id: null, total: { $sum: '$amountMinor' } } },
    ]);
    const collectedMinor = collectedRows[0]?.total ?? 0;

    // Aging for open invoices past their due date (bounded scan).
    const now = new Date();
    const openInvoices = await ctx.models.Invoice.find(
      { tenantId: ctx.tenantId, currency, status: { $in: openStatuses }, dueDate: { $lt: now } },
      { totalMinor: 1, dueDate: 1 },
    ).limit(1000).lean();
    const aging = JSON.parse(JSON.stringify(S.AGING_BUCKETS)) as S.AgingBucket[];
    for (const inv of openInvoices) {
      const days = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);
      if (days >= 0) S.addToAging(aging, days, Number(inv.totalMinor));
    }

    return {
      totalInvoices: statusRows.reduce((a, r) => a + Number(r.count), 0),
      paid: get('paid').count,
      pending: get('issued').count,
      partiallyPaid: get('partially_paid').count,
      overdue: get('overdue').count,
      cancelled: get('cancelled').count,
      draft: get('draft').count,
      invoicedMinor,
      collectedMinor,
      outstandingMinor,
      collectionRatePct: Math.round(S.collectionRate(collectedMinor, invoicedMinor) * 10) / 10,
      aging,
      hasData: statusRows.length > 0,
    };
  };

  const data = await cachedAnalytics(ctx.models, ctx.tenantId, 'invoices', range, {}, load);
  const [collectionTrend, amountTrend] = await Promise.all([
    seriesFor(ctx, { type: 'charge', status: 'completed', currency }, range, range.granularity),
    seriesFor(ctx, { type: 'charge', currency }, range, range.granularity),
  ]);
  return { currency, collectionTrend, amountTrend, ...data };
}

// --------------------------------------------------------------- cash flow ---

export interface CashflowIntel {
  currency: string;
  moneyInMinor: number;
  refundsMinor: number;
  debitsMinor: number;
  creditsMinor: number;
  netCashFlowMinor: number;
  inflowTrend: S.SeriesPoint[];
  outflowTrend: S.SeriesPoint[];
  netTrend: S.SeriesPoint[];
  monthlyTable: Array<{ period: string; inMinor: number; outMinor: number; netMinor: number }>;
  hasData: boolean;
}

export async function cashflow(ctx: Ctx, query: RangeQuery): Promise<CashflowIntel> {
  const range = resolveRange(query);
  const currency = await dominantCurrency(ctx);
  const cur = { currency };
  const win = rangeWindow(range);

  const load = async () => {
    const [moneyIn, refunds, debits, credits] = await Promise.all([
      sumTx(ctx, { type: 'charge', status: 'completed', ...cur, ...win }),
      sumTx(ctx, { type: 'refund', status: 'completed', ...cur, ...win }),
      sumTx(ctx, { type: 'debit', status: 'completed', ...cur, ...win }),
      sumTx(ctx, { type: 'credit', status: 'completed', ...cur, ...win }),
    ]);
    const moneyInMinor = moneyIn.total + credits.total;
    const outflowMinor = refunds.total + debits.total;
    return {
      moneyInMinor,
      refundsMinor: refunds.total,
      debitsMinor: debits.total,
      creditsMinor: credits.total,
      netCashFlowMinor: moneyInMinor - outflowMinor,
      hasData: moneyIn.count + credits.count + refunds.count + debits.count > 0,
    };
  };

  const data = await cachedAnalytics(ctx.models, ctx.tenantId, 'cashflow', range, {}, load);
  const g: Granularity = range.to.getTime() - range.from.getTime() > 92 * 86_400_000 ? 'monthly' : 'daily';
  const [inflowTrend, outflowTrend] = await Promise.all([
    seriesFor(ctx, { type: { $in: ['charge', 'credit'] }, status: 'completed', currency }, range, g),
    seriesFor(ctx, { type: { $in: ['refund', 'debit'] }, status: 'completed', currency }, range, g),
  ]);
  const netTrend = inflowTrend.map((p, i) => ({
    key: p.key,
    label: p.label,
    value: p.value - (outflowTrend[i]?.value ?? 0),
  }));

  const monthlyRows = await ctx.models.LedgerTransaction.aggregate([
    {
      $match: {
        tenantId: ctx.tenantId,
        type: { $in: ['charge', 'refund', 'credit', 'debit'] },
        status: 'completed',
        currency,
        createdAt: win.createdAt,
      },
    },
    {
      $project: {
        amountMinor: 1,
        y: { $year: '$createdAt' },
        m: { $month: '$createdAt' },
        isInflow: { $in: ['$type', ['charge', 'credit']] },
      },
    },
    { $group: { _id: { y: '$y', m: '$m', isInflow: '$isInflow' }, total: { $sum: '$amountMinor' } } },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ]);
  const tableMap = new Map<string, { period: string; inMinor: number; outMinor: number; netMinor: number }>();
  for (const row of monthlyRows) {
    const period = `${row._id.y}-${String(row._id.m).padStart(2, '0')}`;
    const entry = tableMap.get(period) ?? { period, inMinor: 0, outMinor: 0, netMinor: 0 };
    if (row._id.isInflow) entry.inMinor += row.total;
    else entry.outMinor += row.total;
    entry.netMinor = entry.inMinor - entry.outMinor;
    tableMap.set(period, entry);
  }

  return { currency, inflowTrend, outflowTrend, netTrend, monthlyTable: [...tableMap.values()], ...data };
}

// ------------------------------------------------------- ledger analytics ---

export interface LedgerIntel {
  currency: string;
  totalEntries: number;
  totalTransactions: number;
  debitVolumeMinor: number;
  creditVolumeMinor: number;
  balancedCount: number;
  failedCount: number;
  rolledBackCount: number;
  activityTrend: S.SeriesPoint[];
  debitCredit: Array<{ label: string; value: number }>;
  consistencyPct: number;
  hasData: boolean;
}

export async function ledgerAnalytics(ctx: Ctx, query: RangeQuery): Promise<LedgerIntel> {
  const range = resolveRange(query);
  const currency = await dominantCurrency(ctx);
  const win = rangeWindow(range);

  const load = async () => {
    const [entryRows, txStatusRows] = await Promise.all([
      ctx.models.LedgerEntry.aggregate([
        { $match: { tenantId: ctx.tenantId, currency, createdAt: win.createdAt } },
        { $group: { _id: '$direction', volume: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
      ]),
      ctx.models.LedgerTransaction.aggregate([
        { $match: { tenantId: ctx.tenantId, currency, createdAt: win.createdAt } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);
    const byDir = new Map(entryRows.map((r) => [String(r._id), r]));
    const byStatus = new Map(txStatusRows.map((r) => [String(r._id), r]));
    const completed = byStatus.get('completed')?.count ?? 0;
    const failed = (byStatus.get('failed')?.count ?? 0) + (byStatus.get('rolled_back')?.count ?? 0);
    const totalTx = txStatusRows.reduce((a, r) => a + Number(r.count), 0);
    return {
      totalEntries: entryRows.reduce((a, r) => a + Number(r.count), 0),
      totalTransactions: totalTx,
      debitVolumeMinor: byDir.get('debit')?.volume ?? 0,
      creditVolumeMinor: byDir.get('credit')?.volume ?? 0,
      balancedCount: completed,
      failedCount: failed,
      rolledBackCount: byStatus.get('rolled_back')?.count ?? 0,
      consistencyPct: totalTx > 0 ? Math.round((completed / totalTx) * 1000) / 10 : 0,
      hasData: totalTx > 0,
    };
  };

  const data = await cachedAnalytics(ctx.models, ctx.tenantId, 'ledger', range, {}, load);
  const activityTrend = await seriesFor(ctx, {}, range, range.granularity === 'yearly' ? 'monthly' : range.granularity);
  return {
    currency,
    activityTrend,
    debitCredit: [
      { label: 'Debit', value: data.debitVolumeMinor },
      { label: 'Credit', value: data.creditVolumeMinor },
    ],
    ...data,
  };
}

// ------------------------------------------------------- financial health ---

export type HealthStatus = 'Healthy' | 'Stable' | 'Needs Attention' | 'At Risk';

export interface FinancialHealth {
  currency: string;
  status: HealthStatus;
  score: number; // 0..100
  reasons: string[];
  indicators: Array<{
    name: string;
    value: number;
    unit: '%' | 'minor' | 'count';
    good: boolean | null;
    note: string;
  }>;
}

/**
 * Transparent rule-based classification:
 *   Healthy ≥ 80 · Stable ≥ 60 · Needs Attention ≥ 40 · At Risk < 40.
 * Indicators: growth, collection rate, payment success rate, refund rate,
 * outstanding exposure vs revenue, revenue concentration, customer activity,
 * cash flow sign. Every point deduction is explained in `reasons`.
 */
export async function financialHealth(ctx: Ctx, query: RangeQuery): Promise<FinancialHealth> {
  const [ovr, inv, pay, cust, cf] = await Promise.all([
    overview(ctx, query),
    invoices(ctx, query),
    payments(ctx, query),
    customers(ctx, query),
    cashflow(ctx, query),
  ]);

  let score = 100;
  const reasons: string[] = [];
  const indicators: FinancialHealth['indicators'] = [];

  // Revenue growth (20)
  const growth = ovr.deltas.grossRevenue?.pct ?? 0;
  if (growth >= 5) indicators.push({ name: 'Revenue Growth', value: growth, unit: '%', good: true, note: 'Growing' });
  else if (growth >= -5) indicators.push({ name: 'Revenue Growth', value: growth, unit: '%', good: null, note: 'Flat' });
  else {
    score -= Math.min(20, Math.abs(growth) / 2);
    indicators.push({ name: 'Revenue Growth', value: growth, unit: '%', good: false, note: 'Declining' });
    reasons.push(`Revenue declined ${Math.abs(growth).toFixed(1)}% vs previous period`);
  }

  // Collection rate (20)
  if (inv.collectionRatePct >= 80) {
    indicators.push({ name: 'Collection Rate', value: inv.collectionRatePct, unit: '%', good: true, note: 'Strong collections' });
    reasons.push('Collection rate is strong');
  } else if (inv.collectionRatePct >= 50) {
    score -= 10;
    indicators.push({ name: 'Collection Rate', value: inv.collectionRatePct, unit: '%', good: null, note: 'Moderate' });
    reasons.push('Collection rate is moderate — receivables are accumulating');
  } else {
    score -= 20;
    indicators.push({ name: 'Collection Rate', value: inv.collectionRatePct, unit: '%', good: false, note: 'Weak' });
    reasons.push('Collection rate below 50%');
  }

  // Payment success rate (15)
  if (ovr.paymentSuccessRate >= 90) {
    indicators.push({ name: 'Payment Success Rate', value: ovr.paymentSuccessRate, unit: '%', good: true, note: 'Reliable' });
  } else {
    score -= Math.min(15, (100 - ovr.paymentSuccessRate) / 2);
    indicators.push({ name: 'Payment Success Rate', value: ovr.paymentSuccessRate, unit: '%', good: ovr.paymentSuccessRate >= 75, note: ovr.paymentSuccessRate >= 75 ? 'Acceptable' : 'Failing often' });
    if (ovr.paymentSuccessRate < 75) reasons.push(`Only ${ovr.paymentSuccessRate}% of payment attempts succeed`);
  }

  // Refund rate (15)
  const refundPct = pay.refundRate;
  if (refundPct <= 5) {
    indicators.push({ name: 'Refund Rate', value: refundPct, unit: '%', good: true, note: 'Low refunds' });
  } else {
    score -= Math.min(15, refundPct / 3);
    indicators.push({ name: 'Refund Rate', value: refundPct, unit: '%', good: false, note: 'Elevated refunds' });
    reasons.push(`Refund rate at ${refundPct}% of successful charges`);
  }

  // Outstanding exposure (10): outstanding vs gross revenue in period
  const exposure = ovr.grossRevenueMinor > 0 ? inv.outstandingMinor / ovr.grossRevenueMinor : inv.outstandingMinor > 0 ? 99 : 0;
  if (exposure <= 1) {
    indicators.push({ name: 'Outstanding Exposure', value: Math.round(exposure * 100), unit: '%', good: true, note: 'Receivables well covered by revenue' });
  } else {
    score -= Math.min(10, Math.round(exposure));
    indicators.push({ name: 'Outstanding Exposure', value: Math.round(exposure * 100), unit: '%', good: false, note: 'Outstanding exceeds period revenue' });
    reasons.push('Outstanding receivables exceed period revenue');
  }

  // Revenue concentration (10)
  const top5 = cust.concentration.find((c) => c.label === 'Top 5')?.sharePct ?? 0;
  if (top5 <= 60 || !cust.hasData) {
    indicators.push({ name: 'Revenue Concentration (Top 5)', value: top5, unit: '%', good: top5 <= 60 ? true : null, note: cust.hasData ? 'Diversified enough' : 'No data' });
    reasons.push(cust.hasData ? 'Customer base is reasonably diversified' : 'No customer data yet');
  } else {
    score -= Math.min(10, Math.round((top5 - 60) / 4));
    indicators.push({ name: 'Revenue Concentration (Top 5)', value: top5, unit: '%', good: false, note: 'High dependency risk' });
    reasons.push(`Top 5 customers contribute ${top5}% of revenue`);
  }

  // Cash flow sign (10)
  if (!cf.hasData) {
    indicators.push({ name: 'Cash Flow', value: 0, unit: 'minor', good: null, note: 'No data' });
  } else if (cf.netCashFlowMinor >= 0) {
    indicators.push({ name: 'Cash Flow', value: cf.netCashFlowMinor, unit: 'minor', good: true, note: 'Positive net flow' });
    reasons.push('Net cash flow is positive');
  } else {
    score -= 10;
    indicators.push({ name: 'Cash Flow', value: cf.netCashFlowMinor, unit: 'minor', good: false, note: 'Negative net flow' });
    reasons.push('Net cash flow is negative (outflows exceed inflows)');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const status: HealthStatus =
    score >= 80 ? 'Healthy' : score >= 60 ? 'Stable' : score >= 40 ? 'Needs Attention' : 'At Risk';
  if (reasons.length === 0) reasons.push('All indicators are within healthy ranges');

  return { currency: ovr.currency, status, score, reasons, indicators };
}