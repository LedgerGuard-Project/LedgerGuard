import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { buildOperationsQueue } from '../services/billing/operations.service';
import { buildCloseDashboard } from '../services/billing/closeDashboard.service';

export const queue = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { items, summary } = await buildOperationsQueue(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
  );
  res.json({ success: true, data: { items, summary } });
});

export const closeDashboard = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const periodStart = req.query.start ? new Date(String(req.query.start)) : undefined;
  const periodEnd = req.query.end ? new Date(String(req.query.end)) : undefined;
  const data = await buildCloseDashboard(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    periodStart && !Number.isNaN(periodStart.getTime()) ? periodStart : undefined,
    periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd : undefined,
  );
  res.json({ success: true, data });
});