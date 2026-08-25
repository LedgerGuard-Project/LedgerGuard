import type { BillingModels } from '../../models/billing';

export interface TrendPoint {
  key: string;
  label: string;
  amountMinor: number;
}

export interface InvoiceStatusDist {
  draft: number;
  issued: number;
  paid: number;
  partially_paid: number;
  overdue: number;
  cancelled: number;
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
  // ---- Phase 2 analytics additions ----
  totalCollectedMinor: number;
  refundTotalMinor: number;
  invoiceCount: number;
  paidInvoiceCount: number;
  overdueInvoiceCount: number;
  revenueTrend: TrendPoint[];
  paymentTrend: TrendPoint[];
  invoiceStatusDist: InvoiceStatusDist;
  reconciliation: {
    totalBankTransactions: number;
    matchedCount: number;
    unmatchedCount: number;
    mismatchCount: number;
  };
  recentTransactions: unknown[];
}

const startOfDay = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfMonth = (): Date => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Real billing KPIs aggregated from the tenant's transactions/accounts.
 * Revenue metrics are scoped to the tenant's dominant account currency so the
 * sums are meaningfully comparable instead of mixing currency minor units.
 */
export async function billingSummary(
  models: BillingModels,
  tenantId: string,
): Promise<BillingSummary> {
  const currency = await dominantCurrency(models, tenantId);

  const moneyFilter = (from: Date) => ({
    tenantId,
    type: 'charge',
    status: 'completed',
    currency,
    createdAt: { $gte: from },
  });

  const [totalRevenue, todayRevenue, monthly, pending, failed, accounts, invoices, recent, refunds, invoiceStats, reconciliation] =
    await Promise.all([
      sumMinor(models, { tenantId, type: 'charge', status: 'completed', currency }),
      sumMinor(models, moneyFilter(startOfDay())),
      sumMinorAndCount(models, moneyFilter(startOfMonth())),
      sumMinorAndCount(models, {
        tenantId,
        currency,
        type: 'charge',
        status: { $in: ['pending', 'processing'] },
      }),
      sumMinorAndCount(models, {
        tenantId,
        currency,
        type: 'charge',
        status: { $in: ['failed', 'rolled_back'] },
      }),
      accountsPercent(models, tenantId, currency),
      invoicesTotal(models, tenantId),
      models.LedgerTransaction.find({ tenantId, currency, type: 'charge' })
        .sort({ createdAt: -1 })
        .limit(10),
      refundTotal(models, tenantId, currency),
      invoiceStatusDistribution(models, tenantId),
      reconciliationStats(models, tenantId),
    ]);

  return {
    currency,
    totalRevenueMinor: totalRevenue,
    todayRevenueMinor: todayRevenue,
    pendingCount: pending.count,
    pendingAmountMinor: pending.total,
    failedCount: failed.count,
    failedAmountMinor: failed.total,
    outstandingInvoicesMinor: invoices.total,
    outstandingInvoicesCount: invoices.count,
    currentBalanceMinor: accounts,
    monthlyBillingMinor: monthly.total,
    monthlyBillingCount: monthly.count,
    totalCollectedMinor: totalRevenue - refunds,
    refundTotalMinor: refunds,
    invoiceCount: invoiceStats.count,
    paidInvoiceCount: invoiceStats.paid,
    overdueInvoiceCount: invoiceStats.overdue,
    revenueTrend: await trend(models, tenantId, 'charge', 'completed', currency),
    paymentTrend: await trend(models, tenantId, 'charge', 'completed', currency),
    invoiceStatusDist: invoiceStats.dist,
    reconciliation: {
      totalBankTransactions: reconciliation.totalBankTransactions,
      matchedCount: reconciliation.matchedCount,
      unmatchedCount: reconciliation.unmatchedCount,
      mismatchCount: reconciliation.mismatchCount,
    },
    recentTransactions: recent.map((t) => t.toJSON()),
  };
}

async function dominantCurrency(models: BillingModels, tenantId: string): Promise<string> {
  const agg = await models.BillingAccount.aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$currency', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);
  return agg[0]?._id ?? 'USD';
}

async function sumMinor(
  models: BillingModels,
  match: Record<string, unknown>,
): Promise<number> {
  const res = await models.LedgerTransaction.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amountMinor' } } },
  ]);
  return res[0]?.total ?? 0;
}

async function sumMinorAndCount(
  models: BillingModels,
  match: Record<string, unknown>,
): Promise<{ total: number; count: number }> {
  const res = await models.LedgerTransaction.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
  ]);
  return { total: res[0]?.total ?? 0, count: res[0]?.count ?? 0 };
}

async function accountsPercent(
  models: BillingModels,
  tenantId: string,
  currency: string,
): Promise<number> {
  const res = await models.BillingAccount.aggregate([
    { $match: { tenantId, currency } },
    { $group: { _id: null, total: { $sum: '$balanceMinor' } } },
  ]);
  return res[0]?.total ?? 0;
}

async function refundTotal(
  models: BillingModels,
  tenantId: string,
  currency: string,
): Promise<number> {
  return sumMinor(models, { tenantId, currency, type: 'refund', status: 'completed' });
}

async function invoiceStatusDistribution(
  models: BillingModels,
  tenantId: string,
): Promise<{ count: number; paid: number; overdue: number; dist: InvoiceStatusDist }> {
  const res = await models.Invoice.aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const by: Record<string, number> = {};
  for (const r of res) by[String(r._id)] = Number(r.count ?? 0);
  const dist: InvoiceStatusDist = {
    draft: by.draft ?? 0,
    issued: by.issued ?? 0,
    paid: by.paid ?? 0,
    partially_paid: by.partially_paid ?? 0,
    overdue: by.overdue ?? 0,
    cancelled: by.cancelled ?? 0,
  };
  return {
    count: Object.values(by).reduce((a, b) => a + b, 0),
    paid: dist.paid,
    overdue: dist.overdue,
    dist,
  };
}

async function reconciliationStats(
  models: BillingModels,
  tenantId: string,
): Promise<{ totalBankTransactions: number; matchedCount: number; unmatchedCount: number; mismatchCount: number }> {
  const [total, matched, unmatched, mismatch] = await Promise.all([
    models.BankTransaction.countDocuments({ tenantId }),
    models.BankTransaction.countDocuments({ tenantId, status: { $in: ['matched', 'manually_matched'] } }),
    models.BankTransaction.countDocuments({ tenantId, status: 'unmatched' }),
    models.BankTransaction.countDocuments({ tenantId, status: 'mismatch' }),
  ]);
  return { totalBankTransactions: total, matchedCount: matched, unmatchedCount: unmatched, mismatchCount: mismatch };
}

/** Build a last-8-months trend from completed charges (minor units). */
async function trend(
  models: BillingModels,
  tenantId: string,
  type: string,
  status: string,
  currency: string,
): Promise<TrendPoint[]> {
  const months: { key: string; from: Date; to: Date; label: string }[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push({
      key: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`,
      from,
      to,
      label: from.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
    });
  }
  const res = await models.LedgerTransaction.aggregate([
    { $match: { tenantId, type, status, currency, createdAt: { $gte: months[0].from } } },
    { $project: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' }, amountMinor: 1 } },
    { $group: { _id: { y: '$y', m: '$m' }, total: { $sum: '$amountMinor' } } },
  ]);
  const map = new Map<string, number>();
  for (const r of res) {
    const { y, m } = r._id as { y: number; m: number };
    map.set(`${y}-${String(m).padStart(2, '0')}`, Number(r.total ?? 0));
  }
  return months.map((m) => ({
    key: m.key,
    label: m.label,
    amountMinor: map.get(m.key) ?? 0,
  }));
}

async function invoicesTotal(
  models: BillingModels,
  tenantId: string,
): Promise<{ total: number; count: number }> {
  const res = await models.Invoice.aggregate([
    { $match: { tenantId, status: { $in: ['issued', 'partially_paid', 'overdue'] } } },
    { $group: { _id: null, total: { $sum: '$totalMinor' }, count: { $sum: 1 } } },
  ]);
  return { total: res[0]?.total ?? 0, count: res[0]?.count ?? 0 };
}