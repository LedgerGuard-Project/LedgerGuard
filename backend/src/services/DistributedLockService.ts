import { config } from '../config';
import { logger } from '../utils/logger';
import { newLockToken } from '../utils/ids';
import { redisService } from './redis/RedisService';

const LOCK_PREFIX = 'ledgerguard:lock';

export interface LockAcquireResult {
  ok: boolean;
  token?: string;
  /**
   * 'redis_unavailable' -> Redis is down and the failure policy rejected the op.
   * 'contention'        -> another process is already processing this key.
   */
  reason?: 'redis_unavailable' | 'contention';
  /** True when the lock was served from the in-process fallback (fail_open). */
  degraded?: boolean;
}

/**
 * Cross-process distributed lock on top of Redis.
 *
 * Key format: ledgerguard:lock:{tenantId}:{idempotencyKey}
 *
 * Guarantees:
 *  - atomic acquisition (SET NX PX)
 *  - bounded TTL so a crashed holder never deadlocks the key
 *  - owner-token safe release (Lua compare-and-delete)
 *  - honest behaviour when Redis is down, following the configured policy:
 *      fail_closed -> refuse financial work
 *      fail_open   -> proceed with a same-process fallback + degraded flag
 */
export class DistributedLockService {
  /** In-process emulation used only when Redis is unavailable and fail_open. */
  private memoryLocks = new Map<string, { token: string; expiresAt: number }>();

  lockKey(tenantId: string, idempotencyKey: string): string {
    return `${LOCK_PREFIX}:${tenantId}:${idempotencyKey}`;
  }

  async acquire(tenantId: string, idempotencyKey: string): Promise<LockAcquireResult> {
    const key = this.lockKey(tenantId, idempotencyKey);

    if (!redisService.isAvailable) {
      if (config.lockFailurePolicy === 'fail_closed') {
        logger.error(
          `Lock acquisition refused for ${key}: Redis unavailable and policy is fail_closed`,
        );
        return { ok: false, reason: 'redis_unavailable' };
      }
      return this.acquireMemory(key);
    }

    const token = newLockToken();
    let acquired = false;
    for (let attempt = 0; attempt <= config.lockRetryCount; attempt++) {
      acquired = await redisService.acquireLock(key, token, config.lockTTLMs);
      if (acquired) break;
      if (attempt < config.lockRetryCount) {
        await sleep(config.lockRetryDelayMs);
      }
    }

    if (!acquired) {
      logger.warn(`Lock contention on ${key} — another process is processing this operation`);
      return { ok: false, reason: 'contention' };
    }
    return { ok: true, token };
  }

  async release(tenantId: string, idempotencyKey: string, token: string): Promise<void> {
    const key = this.lockKey(tenantId, idempotencyKey);
    if (redisService.isAvailable) {
      await redisService.releaseLock(key, token);
      return;
    }
    // Best-effort in-process release (fail_open fallback).
    const entry = this.memoryLocks.get(key);
    if (entry?.token === token) {
      this.memoryLocks.delete(key);
    }
  }

  /**
   * Run `fn` while holding the lock. Lock is released in a finally block.
   * Returns { result, degraded } or throws LockError when the lock cannot be
   * acquired under fail_closed / contention.
   */
  async withLock<T>(
    tenantId: string,
    idempotencyKey: string,
    fn: () => Promise<T>,
  ): Promise<{ result: T; degraded?: boolean }> {
    const acquired = await this.acquire(tenantId, idempotencyKey);
    if (!acquired.ok) {
      throw new LockError(acquired.reason ?? 'contention');
    }
    try {
      const result = await fn();
      return { result, degraded: acquired.degraded };
    } finally {
      await this.release(tenantId, idempotencyKey, acquired.token as string);
    }
  }

  private async acquireMemory(key: string): Promise<LockAcquireResult> {
    const now = Date.now();
    const existing = this.memoryLocks.get(key);
    if (existing && existing.expiresAt > now) {
      return { ok: false, reason: 'contention' };
    }
    if (existing && existing.expiresAt <= now) {
      this.memoryLocks.delete(key);
    }
    const token = newLockToken();
    this.memoryLocks.set(key, { token, expiresAt: now + config.lockTTLMs });
    logger.warn(`Redis unavailable; ${key} locked via in-process fallback (fail_open)`);
    return { ok: true, token, degraded: true };
  }
}

export class LockError extends Error {
  public readonly reason: 'redis_unavailable' | 'contention';
  constructor(reason: 'redis_unavailable' | 'contention') {
    super(
      reason === 'contention'
        ? 'This payment is already being processed by another request'
        : 'Distributed locking is unavailable (Redis is down) and the failure policy is fail_closed',
    );
    this.name = 'LockError';
    this.reason = reason;
  }
}

export const distributedLockService = new DistributedLockService();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
