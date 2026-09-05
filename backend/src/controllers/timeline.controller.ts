import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { buildTimeline } from '../services/billing/timeline.service';
import { ApiError } from '../utils/ApiError';

const ALLOWED = ['invoice', 'payment', 'customer', 'subscription'] as const;

export const get = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const entityType = req.params.entityType as (typeof ALLOWED)[number];
  if (!ALLOWED.includes(entityType)) {
    throw ApiError.badRequest('Unsupported timeline entity type', 'INVALID_ENTITY_TYPE');
  }
  const events = await buildTimeline(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    entityType,
    req.params.entityId,
  );
  res.json({ success: true, data: { events } });
});