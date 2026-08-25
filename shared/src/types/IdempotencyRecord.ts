import type { ObjectId } from './primitives';

export const IDEMPOTENCY_STATUSES = ['processing', 'completed', 'failed'] as const;
export type IdempotencyStatus = (typeof IDEMPOTENCY_STATUSES)[number];

/**
 * Persisted idempotency record. A unique compound index on (tenantId, key)
 * guarantees the same key can only ever drive ONE financial operation per
 * tenant — while the same key string remains valid for other tenants.
 */
export interface IdempotencyRecord {
  id: ObjectId;
  tenantId: string;
  key: string;
  /** sha256 of the canonical request body used to detect conflicting replays. */
  requestHash?: string;
  status: IdempotencyStatus;
  /** Snapshot of the successful response so replays can be replayed verbatim. */
  response?: unknown;
  transactionId?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}