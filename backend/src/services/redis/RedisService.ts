import Redis from 'ioredis';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export type RedisStatus = 'disabled' | 'connecting' | 'connected' | 'unavailable';

/**
 * Real Redis client used for the distributed locking + cache layers.
 *
 * Connection state is reported honestly: when Redis is unreachable the service
 * exposes `status === 'unavailable'` so callers can follow the configured
 * failure policy instead of pretending locking is active.
 */
class RedisService {
  private client: Redis | null = null;
  private statusValue: RedisStatus = 'disabled';
  private lastErrorValue: string | null = null;
  private readonly retryAttempts = 3;

  get status(): RedisStatus {
    return this.statusValue;
  }

  get lastError(): string | null {
    return this.lastErrorValue;
  }

  get isEnabled(): boolean {
    return config.redisEnabled;
  }

  /** True when distributed operations are actually backed by Redis. */
  get isAvailable(): boolean {
    return this.statusValue === 'connected' && this.client !== null;
  }

  async connect(): Promise<RedisStatus> {
    if (!config.redisEnabled) {
      this.statusValue = 'disabled';
      logger.info('Redis disabled by configuration; distributed locking unavailable');
      return this.statusValue;
    }
    if (this.statusValue === 'connected' && this.client) {
      return this.statusValue;
    }

    this.statusValue = 'connecting';
    this.lastErrorValue = null;
    const client = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times > this.retryAttempts) {
          logger.error(
            `Redis connection failed after ${this.retryAttempts} retries (${config.redisUrl})`,
          );
          return null; // stop retrying
        }
        return Math.min(times * 200, 1000);
      },
    });

    client.on('ready', () => {
      this.statusValue = 'connected';
      this.lastErrorValue = null;
      logger.info(`Redis connected: ${config.redisUrl}`);
    });
    client.on('error', (err: Error) => {
      this.lastErrorValue = err.message;
      if (this.statusValue === 'connecting' || this.statusValue === 'connected') {
        this.statusValue = 'unavailable';
        logger.error(`Redis connection error: ${err.message}`);
      }
    });
    client.on('end', () => {
      if (this.statusValue === 'connected') {
        this.statusValue = 'unavailable';
        logger.warn('Redis connection closed');
      }
    });

    try {
      await client.connect();
      // Force an immediate status round-trip so callers see a real answer.
      await client.ping();
      this.statusValue = 'connected';
      this.client = client;
      logger.info('Redis ping OK — distributed locking active');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastErrorValue = message;
      this.statusValue = 'unavailable';
      logger.error(`Redis unavailable (${config.redisUrl}): ${message}`);
      try {
        client.disconnect();
      } catch {
        /* already closed */
      }
    }
    return this.statusValue;
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
    this.client = null;
    this.statusValue = config.redisEnabled ? 'unavailable' : 'disabled';
  }

  // ---- Generic key/value API (used by the cache layer) ----

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.isAvailable) return null;
    const value = await this.client.get(key);
    return value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client || !this.isAvailable) return false;
    await this.client.setex(key, Math.max(1, Math.floor(ttlSeconds)), value);
    return true;
  }

  async setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client || !this.isAvailable) return false;
    const result = ttlSeconds === undefined
      ? await this.client.set(key, value, 'NX')
      : await this.client.set(key, value, 'EX', Math.max(1, Math.floor(ttlSeconds)), 'NX');
    return result === 'OK';
  }

  async delete(key: string): Promise<boolean> {
    if (!this.client || !this.isAvailable) return false;
    const deleted = await this.client.del(key);
    return deleted > 0;
  }

  // ---- Distributed lock primitives ----

  /** Atomically take a lock when absent: SET key token PX ttl NX. */
  async acquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    if (!this.client || !this.isAvailable) return false;
    const result = await this.client.set(key, token, 'PX', Math.max(1, Math.floor(ttlMs)), 'NX');
    return result === 'OK';
  }

  /**
   * Safe release: the Lua script only deletes the key when the stored value
   * still equals the owner token, preventing one holder from deleting a lock
   * that has since been re-acquired by somebody else.
   */
  async releaseLock(key: string, token: string): Promise<boolean> {
    if (!this.client || !this.isAvailable) return false;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end`;
    const result = await this.client.eval(script, 1, key, token);
    return result === 1;
  }
}

export const redisService = new RedisService();
