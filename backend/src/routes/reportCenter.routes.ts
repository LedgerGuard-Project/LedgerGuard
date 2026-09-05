import { Router } from 'express';
import type { Response as ExpressResponse } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import type { AuthenticatedRequest } from '../types';
import { UserRole } from '@ledgerguard/shared';
import { insightCtx } from '../services/analytics/insightCtx';
import { newReportConfigId, newExportId } from '../services/analytics/insights.service';
import * as metrics from '../services/analytics/metrics.service';

/**
 * Phase 3 Report Center: saved report configurations and tenant-scoped CSV
 * exports. Only predefined analytics payloads are exported â€” never raw Mongo
 * queries. Export rows are whitelisted field projections.
 */

const router = Router();

const REPORT_TYPES = ['revenue', 'payments', 'invoices', 'customers', 'cashflow', 'ledger', 'anomalies'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

const saveSchema = z
  .object({
    name: z.string().min(1).max(120),
    reportType: z.enum(REPORT_TYPES),
    configuration: z
      .object({
        preset: z.string().optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .strict(),
  })
  .strict();

router.get('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  const items = await ctx.extra.SavedReport.find({ tenantId: ctx.tenantId }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: { items } });
}));

router.post('/', authenticate, requireRole(UserRole.FinanceManager), asyncHandler(async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => i.message).join('; ') } });
    return;
  }
  const ctx = insightCtx(req);
  const doc = await ctx.extra.SavedReport.create({
    reportConfigId: newReportConfigId(),
    tenantId: ctx.tenantId,
    createdBy: ctx.userId,
    ...parsed.data,
  });
  res.status(201).json({ success: true, data: doc.toJSON() });
}));

router.delete('/:reportConfigId', authenticate, requireRole(UserRole.FinanceManager), asyncHandler(async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  const result = await ctx.extra.SavedReport.deleteOne({
    tenantId: ctx.tenantId,
    reportConfigId: String(req.params.reportConfigId),
  });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, error: { code: 'REPORT_NOT_FOUND', message: 'Saved report not found' } });
    return;
  }
  res.json({ success: true, data: { deleted: true } });
}));

// ---- CSV export (records history; synchronous generation is bounded by limits).

/**
 * Escape a single CSV cell value:
 * - Quote fields containing commas, quotes, or newlines.
 * - Prevent formula injection in spreadsheet viewers by prefixing
 *   cells starting with =, +, -, @, TAB, or CR with a single quote.
 */
function escapeCsvValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  const needsQuote = /["',\n\r]/.test(s);
  let escaped = s.replace(/"/g, '""');
  if (needsQuote) escaped = '"' + escaped + '"';
  if (/^[=+\-@*\t\r]/.test(s)) escaped = "'" + escaped;
  return escaped;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escapeCsvValue(r[h])).join(','))].join('\n');
}
async function buildRows(
  ctx: ReturnType<typeof insightCtx>,
  reportType: ReportType,
  query: Record<string, string | undefined>,
): Promise<Array<Record<string, unknown>>> {
  switch (reportType) {
    case 'revenue': {
      const d = await metrics.revenue(ctx, query);
      return [
        ...d.trend.map((p) => ({ section: 'revenue_trend', key: p.key, value: p.value })),
        ...d.byCustomer.map((c) => ({ section: 'by_customer', customerId: c.customerId, name: c.name ?? '', value: c.total })),
      ];
    }
    case 'payments': {
      const d = await metrics.payments(ctx, query);
      return [
        ...d.statusDist.map((s) => ({ section: 'status', status: s.status, count: s.count, amountMinor: s.amountMinor })),
        ...d.failureReasons.map((f) => ({ section: 'failure_reason', reason: f.reason, count: f.count, amountMinor: f.amountMinor })),
      ];
    }
    case 'invoices': {
      const d = await metrics.invoices(ctx, query);
      return d.aging.map((a) => ({
        section: 'aging',
        bucket: a.label,
        invoiceCount: a.invoiceCount,
        outstandingMinor: a.outstandingMinor,
      }));
    }
    case 'customers': {
      const d = await metrics.customers(ctx, query);
      return d.healthScores.map((h) => ({
        section: 'health',
        customerId: h.customerId,
        name: h.name ?? '',
        score: h.score,
        band: h.band,
        revenueMinor: h.revenueMinor,
        outstandingMinor: h.outstandingMinor,
      }));
    }
    case 'cashflow': {
      const d = await metrics.cashflow(ctx, query);
      return d.monthlyTable.map((m) => ({
        section: 'monthly_cashflow',
        period: m.period,
        inMinor: m.inMinor,
        outMinor: m.outMinor,
        netMinor: m.netMinor,
      }));
    }
    case 'ledger': {
      const d = await metrics.ledgerAnalytics(ctx, query);
      return d.activityTrend.map((p) => ({ section: 'activity', key: p.key, value: p.value }));
    }
    case 'anomalies': {
      const docs = await ctx.extra.Anomaly.find({ tenantId: ctx.tenantId }).sort({ detectedAt: -1 }).limit(500).lean();
      return docs.map((d) => ({
        anomalyId: d.anomalyId,
        kind: d.kind,
        severity: d.severity,
        detectedAt: new Date(d.detectedAt).toISOString(),
        amountMinor: d.amountMinor ?? '',
        status: d.status,
      }));
    }
  }
}

router.post('/export', authenticate, requireRole(UserRole.FinanceManager), asyncHandler(async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const parsed = saveSchema.omit({ name: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => i.message).join('; ') } });
    return;
  }
  const ctx = insightCtx(req);
  const { reportType, configuration } = parsed.data;
  const exportRecord = await ctx.extra.ExportRecord.create({
    exportId: newExportId(),
    tenantId: ctx.tenantId,
    requestedBy: ctx.userId,
    reportType,
    format: 'csv',
    status: 'processing',
    dateFrom: configuration.from,
    dateTo: configuration.to,
  });

  try {
    const rows = await buildRows(ctx, reportType, configuration);
    await ctx.extra.ExportRecord.updateOne(
      { tenantId: ctx.tenantId, exportId: exportRecord.exportId },
      { $set: { status: 'completed', rowCount: rows.length } },
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ledgerguard-${reportType}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(toCsv(rows));
  } catch (err) {
    await ctx.extra.ExportRecord.updateOne(
      { tenantId: ctx.tenantId, exportId: exportRecord.exportId },
      { $set: { status: 'failed', error: (err as Error).message.slice(0, 300) } },
    );
    throw err;
  }
}));

router.get('/exports', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  const items = await ctx.extra.ExportRecord.find({ tenantId: ctx.tenantId }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ success: true, data: { items } });
}));

export default router;

