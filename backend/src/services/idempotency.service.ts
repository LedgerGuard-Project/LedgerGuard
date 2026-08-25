import { createHash } from 'crypto';
import { config } from '../config';
import type { BillingModels } from '../models/billing';
import { ApiError } from '../utils/ApiError';
import { newIdempotencyKey } from '../utils/ids';
import type { IdempotencyRecordDocument } from '../models/billing/IdempotencyRecord';

export type IdempotencyOutcome =
  | { kind: 'created'; record: IdempotencyRecordDocument }
  | { kind: 'replay'; response: unknown; transactionId?: string }
  | { kind: 'in_progress'; record: IdempotencyRecordDocument }
  | { kind: 'retry_after_failure'; record: IdempotencyRecordDocument };

/**
 * Deterministic hash of the request body (keys sorted) used to detect
 * conflicting replays of the same idempotency key.
 */
export function hashRequest(payload: unknown): string {
  const stable = stableStringify(payload);
  return createHash('sha256').update(stable).digest('hex');
}

export function generateIdempotencyKey(): string {
  return newIdempotencyKey();
}

/**
 * Atomically begin an idempotent operation (tenant-scoped).
 *
 * - First request  -> creates a processing record.
 * - Completed replay with the same hash -> returns the stored response.
 * - Completed replay with a different payload -> rejected (hash conflict).
 * - Already processing -> reported so callers can answer "in progress".
 * - Previously failed -> the record is re-armed for a fresh attempt.
 */
export async function beginIdempotency(
  models: BillingModels,
  tenantId: string,
  key: string,
  requestHash: string,
): Promise<IdempotencyOutcome> {
  const existing = await models.IdempotencyRecord.findOne({ tenantId, key });
  if (existing) {
    if (existing.status === 'completed') {
      if (existing.requestHash === requestHash) {
        return { kind: 'replay', response: existing.response, transactionId: existing.transactionId };
      }
      throw ApiError.badRequest(
        'Idempotency-Key was already used for a different request',
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
    if (existing.status === 'processing') {
      return { kind: 'in_progress', record: existing };
    }
    // failed -> re-arm for the new attempt
    existing.status = 'processing';
    existing.requestHash = requestHash;
    existing.response = undefined;
    existing.expiresAt = new Date(Date.now() + config.idempotencyTTLSeconds * 1000);
    await existing.save();
    return { kind: 'retry_after_failure', record: existing };
  }

  try {
    const record = await models.IdempotencyRecord.create({
      tenantId,
      key,
      requestHash,
      status: 'processing',
      expiresAt: new Date(Date.now() + config.idempotencyTTLSeconds * 1000),
    });
    return { kind: 'created', record };
  } catch (err) {
    // Unique-index race: another concurrent request created the record first.
    if (isDuplicateKeyError(err)) {
      const concurrent = await models.IdempotencyRecord.findOne({ tenantId, key });
      if (concurrent?.status === 'completed') {
        return { kind: 'replay', response: concurrent.response, transactionId: concurrent.transactionId };
      }
      return { kind: 'in_progress', record: concurrent as IdempotencyRecordDocument };
    }
    throw err;
  }
}

export async function completeIdempotency(
  record: IdempotencyRecordDocument | null | undefined,
  response: unknown,
  transactionId?: string,
): Promise<void> {
  if (!record) return;
  record.status = 'completed';
  record.response = response;
  if (transactionId) record.transactionId = transactionId;
  await record.save();
}

export async function failIdempotency(
  record: IdempotencyRecordDocument | null | undefined,
): Promise<void> {
  if (!record) return;
  record.status = 'failed';
  record.response = undefined;
  await record.save();
}

/** Look up a completed transaction by its idempotency key (tenant-scoped). */
export async function findTransactionByKey(
  models: BillingModels,
  tenantId: string,
  key: string,
): Promise<IdempotencyRecordDocument | null> {
  return models.IdempotencyRecord.findOne({ tenantId, key, status: 'completed' });
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: number }).code === 11000,
  );
}
