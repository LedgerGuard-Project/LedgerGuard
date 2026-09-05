import type { ObjectId } from './primitives';

/** A saved, user-specific finance workspace (filters / columns / sort). */
export interface SavedView {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "VEW-ab12cd34". */
  viewId: string;
  tenantId: string;
  /** Owner user id — views are strictly user-scoped. */
  userId: string;
  name: string;
  /** Target page/entity this view applies to (e.g. 'invoices', 'exceptions'). */
  entity: string;
  filters: Array<{ field: string; value: string | number | boolean | null }>;
  columns?: string[];
  sort?: { field: string; direction: 'asc' | 'desc' };
  createdAt: string;
  updatedAt: string;
}