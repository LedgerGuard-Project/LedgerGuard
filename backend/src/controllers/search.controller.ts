import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { searchTenant } from '../services/billing/search.service';

export const search = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const term = String(req.query.q ?? '');
  const { items } = await searchTenant(req.tc!.models.billing, req.tc!.tenant.tenantId, term);
  res.json({ success: true, data: { items } });
});