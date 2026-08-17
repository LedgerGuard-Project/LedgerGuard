import type { Response } from 'express';
import { dashboardSummary } from '../services/dashboard.service';
import { asyncHandler } from '../utils/asyncHandler';
import type { AuthenticatedRequest } from '../types';

export const summary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await dashboardSummary(req.tc!.models, req.tc!.tenant);
  res.json({ success: true, data });
});