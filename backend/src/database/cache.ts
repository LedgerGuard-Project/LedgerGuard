import Redis from 'ioredis';
import { config } from '../config';
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

/** Redis-backed store used when Redis is enabled. */
class RedisStore implements KeyValueStore {
  private client: Redis | null = null;

  async connect(): Promise<boolean> {
    try {
      this.client = new Redis(config.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      await this.client.connect();
      logger.info('Redis cache connected');
      return true;
    } catch (err) {
      logger.warn('Redis unavailable, falling back to in-memory cache', { err });
      this.client?.disconnect();
      this.client = null;
      return false;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    await this.client.setex(key, ttlSeconds, value);
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    const val = await this.client.get(key);
    return val ?? null;
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }
}

class Cache implements KeyValueStore {
  private store: KeyValueStore;

  constructor() {
    this.store = new MemoryStore();
  }

  async init(): Promise<void> {
    if (!config.redisEnabled) {
      logger.info('Redis disabled; using in-memory cache');
      return;
    }
    const redis = new RedisStore();
    const ok = await redis.connect();
    if (ok) this.store = redis;
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    return this.store.set(key, value, ttlSeconds);
  }

  get(key: string): Promise<string | null> {
    return this.store.get(key);
  }

  del(key: string): Promise<void> {
    return this.store.del(key);
  }
}

export const cache = new Cache();