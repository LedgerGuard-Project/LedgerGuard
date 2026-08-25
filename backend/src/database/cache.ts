import { config } from '../config';
import { redisService } from '../services/redis/RedisService';
import { logger } from '../utils/logger';

export interface KeyValueStore {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
}

/** In-memory fallback so the platform is fully functional without Redis. */
class MemoryStore implements KeyValueStore {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Cache facade. Uses the shared RedisService when Redis is enabled and
 * connected; otherwise transparently falls back to an in-memory store so the
 * platform keeps working offline.
 */
class Cache implements KeyValueStore {
  private store: KeyValueStore;

  constructor() {
    this.store = new MemoryStore();
  }

  /** Called once at boot. Returns the effective store kind. */
  async init(): Promise<void> {
    if (!config.redisEnabled) {
      logger.info('Redis disabled; using in-memory cache');
      return;
    }
    const status = await redisService.connect();
    if (status === 'connected') {
      logger.info('Cache backed by Redis');
    } else {
      logger.error('Redis connection unavailable; falling back to in-memory cache');
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const ok = await redisService.set(key, value, ttlSeconds);
    if (!ok) await this.store.set(key, value, ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    if (redisService.isAvailable) {
      const value = await redisService.get(key);
      if (value !== null) return value;
    }
    return this.store.get(key);
  }

  async del(key: string): Promise<void> {
    if (redisService.isAvailable) {
      await redisService.delete(key);
    }
    await this.store.del(key);
  }
}

export const cache = new Cache();
