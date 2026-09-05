import type { BillingModels } from '../../models/billing';
import type { SavedViewDocument } from '../../models/billing/SavedView';
import { ApiError } from '../../utils/ApiError';
import { newSavedViewId } from '../../utils/ids';

export interface SaveViewInput {
  name: string;
  entity: string;
  filters: Array<{ field: string; value: string | number | boolean | null }>;
  columns?: string[];
  sort?: { field: string; direction: 'asc' | 'desc' };
}

/** Create a user-specific saved view. Tenant + user scoping is always applied. */
export async function createSavedView(
  models: BillingModels,
  tenantId: string,
  userId: string,
  input: SaveViewInput,
): Promise<SavedViewDocument> {
  if (!input.name || input.name.trim().length === 0) {
    throw ApiError.badRequest('View name is required', 'VIEW_NAME_REQUIRED');
  }
  if (!input.entity || input.entity.trim().length === 0) {
    throw ApiError.badRequest('Entity is required', 'VIEW_ENTITY_REQUIRED');
  }
  const existing = await models.SavedView.findOne({
    tenantId,
    userId,
    name: input.name.trim(),
  });
  if (existing) {
    throw ApiError.conflict('You already have a view with this name', 'VIEW_NAME_TAKEN');
  }
  return models.SavedView.create({
    viewId: newSavedViewId(),
    tenantId,
    userId,
    name: input.name.trim(),
    entity: input.entity.trim(),
    filters: input.filters ?? [],
    columns: input.columns ?? [],
    sort: input.sort,
  });
}

export async function listSavedViews(
  models: BillingModels,
  tenantId: string,
  userId: string,
  entity?: string,
): Promise<SavedViewDocument[]> {
  const query: Record<string, unknown> = { tenantId, userId };
  if (entity) query.entity = entity;
  return models.SavedView.find(query).sort({ createdAt: -1 }).limit(100);
}

export async function deleteSavedView(
  models: BillingModels,
  tenantId: string,
  userId: string,
  viewId: string,
): Promise<void> {
  const result = await models.SavedView.deleteOne({ tenantId, userId, viewId });
  if (result.deletedCount === 0) {
    throw ApiError.notFound('Saved view not found', 'VIEW_NOT_FOUND');
  }
}