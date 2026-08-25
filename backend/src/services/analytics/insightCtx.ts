import type { AuthenticatedRequest } from '../../types';
import { ApiError } from '../../utils/ApiError';
import { createAnalyticsModels, type AnalyticsModels } from '../../models/analytics';

/** Request-scoped context for Phase 3 services: billing models + analytics extras. */
export interface InsightCtx {
  models: import('../../models/billing').BillingModels;
  tenantId: string;
  userId: string;
  extra: AnalyticsModels;
}

/**
 * Build the insight context from the authenticated request's tenant connection.
 * The tenant ALWAYS comes from the authenticated session — never the body/query.
 */
export function insightCtx(req: AuthenticatedRequest): InsightCtx {
  if (!req.tc || !req.authUser) {
    throw ApiError.unauthorized('Not authenticated', 'UNAUTHENTICATED');
  }
  return {
    models: req.tc.models.billing,
    tenantId: req.tc.tenant.tenantId,
    userId: req.authUser.id,
    extra: createAnalyticsModels(req.tc.connection),
  };
}