import { Router } from 'express';
import type { Response as ExpressResponse } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import type { AuthenticatedRequest } from '../types';
import type { Response } from 'express';
import { UserRole } from '@ledgerguard/shared';
import { insightCtx } from '../services/analytics/insightCtx';

/**
 * Financial alert rules (Phase 3). Rules are tenant-scoped and evaluated by
 * the alerts engine against real analytics. Creation/update/delete requires
 * Finance Manager or above; viewers may read.
 */

const router = Router();

const ruleSchema = z
  .object({
    name: z.string().min(1).max(120),
    metric: z.enum(['revenue_below', 'outstanding_above', 'failure_rate_above', 'refund_above', 'large_transaction']),
    thresholdMinor: z.number().int().min(0),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    enabled: z.boolean().default(true),
  })
  .strict();

router.get('/rules', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  const items = await ctx.extra.AlertRule.find({ tenantId: ctx.tenantId }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: { items } });
}));

router.post('/rules', authenticate, requireRole(UserRole.FinanceManager), asyncHandler(async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => i.message).join('; ') } });
    return;
  }
  const ctx = insightCtx(req);
  const doc = await ctx.extra.AlertRule.create({
    ...parsed.data,
    ruleId: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tenantId: ctx.tenantId,
    createdBy: ctx.userId,
  });
  res.status(201).json({ success: true, data: doc.toJSON() });
}));

router.patch('/rules/:ruleId', authenticate, requireRole(UserRole.FinanceManager), asyncHandler(async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const parsed = ruleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => i.message).join('; ') } });
    return;
  }
  const ctx = insightCtx(req);
  const doc = await ctx.extra.AlertRule.findOneAndUpdate(
    { tenantId: ctx.tenantId, ruleId: String(req.params.ruleId) },
    { $set: parsed.data },
    { new: true },
  ).lean();
  if (!doc) {
    res.status(404).json({ success: false, error: { code: 'RULE_NOT_FOUND', message: 'Alert rule not found' } });
    return;
  }
  res.json({ success: true, data: doc });
}));

router.delete('/rules/:ruleId', authenticate, requireRole(UserRole.FinanceManager), asyncHandler(async (req: AuthenticatedRequest, res: ExpressResponse) => {
  const ctx = insightCtx(req);
  const result = await ctx.extra.AlertRule.deleteOne({ tenantId: ctx.tenantId, ruleId: String(req.params.ruleId) });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, error: { code: 'RULE_NOT_FOUND', message: 'Alert rule not found' } });
    return;
  }
  res.json({ success: true, data: { deleted: true } });
}));

export default router;


