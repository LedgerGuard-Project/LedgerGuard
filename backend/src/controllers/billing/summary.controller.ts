import type { Response } from 'express';
import { AuditAction } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import { billingSummary } from '../../services/billing/summary.service';

export const summary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await billingSummary(req.tc!.models.billing, req.tc!.tenant.tenantId);
  res.json({ success: true, data });
});