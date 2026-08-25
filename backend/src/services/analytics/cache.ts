import { createHash } from 'node:crypto';
import type { BillingModels } from '../../models/billing';
import { redisService } from '../redis/RedisService';
import { logger } from '../../utils/logger';

/**
 * Tenant-scoped Redis cache for expensive analytics aggregations.
 *
 * Cache keys ALWAYS include the tenantId — never a global tenant-independent
 * key. When Redis is unavailable the loader runs directly against MongoDB so
 * analytics remain correct (rule 35); we log honestly instead of faking cache
 * hits.
 */

const TTL_SECONDS = 60;

function hashFilters(filters: Record<string, unknown>): string {
  const stable = JSON.stringify(sortDeep(filters));
  return createHash('sha1').update(stable).digest('hex').slice(0, 12);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortDeep(v)]),
    );
  }
  return value;
}

export async function cachedAnalytics<T>(
  models: BillingModels,
  tenantId: string,
  metric: string,
  rangeKey: { from: Date; to: Date },
  filters: Record<string, unknown>,
  loader: () => Promise<T>,
): Promise<T> {
  const key =
    `ledgerguard:analytics:${tenantId}:${metric}` +
    `:${rangeKey.from.toISOString().slice(0, 10)}:${rangeKey.to.toISOString().slice(0, 10)}` +
    `:${hashFilters(filters)}`;

  if (redisService.isAvailable) {
    try {
      const hit = await redisService.get(key);
      if (hit) {
        return JSON.parse(hit) as T;
      }
    } catch (err) {
      logger.warn(`Analytics cache read failed (${metric}): ${(err as Error).message}`);
    }
  } else if (redisService.isEnabled) {
    logger.warn('Analytics cache unavailable — falling back to direct aggregation');
  }

  const data = await loader();

  if (redisService.isAvailable) {
    try {
      await redisService.set(key, JSON.stringify(data), TTL_SECONDS);
    } catch (err) {
      logger.warn(`Analytics cache write failed (${metric}): ${(err as Error).message}`);
    }
  }

  return data;
}

/**
 * Invalidate all cached analytics for a tenant (called after financial events:
 * payment completed / refund / invoice paid / ledger updated / customer changes).
 */
export async function invalidateAnalyticsCache(tenantId: string): Promise<void> {
  if (!redisService.isAvailable) return;
  try {
    await redisService.invalidatePattern(`ledgerguard:analytics:${tenantId}:*`);
  } catch (err) {
    logger.warn(`Analytics cache invalidation failed: ${(err as Error).message}`);
  }
}
