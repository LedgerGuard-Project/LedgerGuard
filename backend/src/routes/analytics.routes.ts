import { Router } from 'express';
import type { Response as ExpressResponse } from 'express';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { UserRole } from '@ledgerguard/shared';
import { rangeQuerySchema } from '../services/analytics/dates';
import * as metrics from '../services/analytics/metrics.service';
import * as insights from '../services/analytics/insights.service';
import { insightCtx } from '../services/analytics/insightCtx';

/**
 * Phase 3 analytics API. Every route requires authentication; the tenant is
 * always derived from the authenticated session (never from query/body).
 * Viewers may read analytics â€” all mutating anomaly actions require
 * Finance Manager or above.
 */

const router = Router();

type Req = AuthenticatedRequest;

function parseRange(req: Req): import('../services/analytics/dates').RangeQuery {
  const parsed = rangeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return {};
  }
  return parsed.data;
}

router.get('/overview', authenticate, asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  res.json({ success: true, data: await metrics.overview(ctx, parseRange(req)) });
}));

router.get('/revenue', authenticate, asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  res.json({ success: true, data: await metrics.revenue(ctx, parseRange(req)) });
}));

router.get('/payments', authenticate, asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  res.json({ success: true, data: await metrics.payments(ctx, parseRange(req)) });
}));

router.get('/customers', authenticate, asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  res.json({ success: true, data: await metrics.customers(ctx, parseRange(req)) });
}));

router.get('/invoices', authenticate, asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  res.json({ success: true, data: await metrics.invoices(ctx, parseRange(req)) });
}));

router.get('/cashflow', authenticate, asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  res.json({ success: true, data: await metrics.cashflow(ctx, parseRange(req)) });
}));

router.get('/ledger', authenticate, asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  res.json({ success: true, data: await metrics.ledgerAnalytics(ctx, parseRange(req)) });
}));

router.get('/financial-health', authenticate, asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  res.json({ success: true, data: await metrics.financialHealth(ctx, parseRange(req)) });
}));

router.get('/activity', authenticate, asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  res.json({ success: true, data: { items: await insights.activityFeed(ctx, 40) } });
}));

router.get('/forecast', authenticate, asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  const horizon = Number(req.query.horizon);
  res.json({
    success: true,
    data: await insights.forecast(ctx, { ...parseRange(req), horizon: Number.isFinite(horizon) ? horizon : undefined }),
  });
}));

// ---- Anomalies ----

router.get('/anomalies', authenticate, asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  const items = await insights.listAnomalies(ctx, {
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
    limit: Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : undefined,
  });
  res.json({ success: true, data: { items } });
}));

router.post('/anomalies/detect', authenticate, requireRole(UserRole.FinanceManager), asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  const summary = await insights.runAnomalyDetection(ctx);
  res.json({ success: true, data: summary });
}));

router.patch('/anomalies/:anomalyId', authenticate, requireRole(UserRole.FinanceManager), asyncHandler(async (req: Req, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  const action = String(req.body?.action ?? '');
  if (!['reviewed', 'acknowledged', 'dismissed'].includes(action)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_ACTION', message: 'action must be reviewed|acknowledged|dismissed' } });
    return;
  }
  await insights.reviewAnomaly(ctx, String(req.params.anomalyId), action as 'reviewed' | 'acknowledged' | 'dismissed');
  res.json({ success: true, data: { anomalyId: String(req.params.anomalyId), action } });
}));

export default router;


