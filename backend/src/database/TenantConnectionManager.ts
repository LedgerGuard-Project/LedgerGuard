import mongoose, { type Connection } from 'mongoose';
import { config } from '../config';
import { createTenantModels, type TenantModels } from './models.factory';
import { logger } from '../utils/logger';

interface PoolEntry {
  connection: Connection;
  models: TenantModels;
  lastUsed: number;
}

/**
 * Manages one dedicated MongoDB connection per tenant and reuses the same
 * database across requests. Guarantees network-level data isolation between
 * subscriber organisations.
 */
export class TenantConnectionManager {
  private pool = new Map<string, PoolEntry>();
  private readonly expiryMs = 1000 * 60 * 30; // idle eviction threshold
  private readonly maxConnections: number;

  constructor(maxConnections: number = config.maxTenantConnections) {
    this.maxConnections = maxConnections;
  }

  /** Build a MongoDB URI pointed at a dedicated tenant database. */
  private tenantUri(dbName: string): string {
    const base = config.mongoBaseUri.endsWith('/')
      ? config.mongoBaseUri.slice(0, -1)
      : config.mongoBaseUri;
    return `${base}/${dbName}`;
  }

  /** Number of currently open tenant connections (health reporting). */
  get activeCount(): number {
    return this.pool.size;
  }

  async connectTenant(tenantId: string, dbName: string): Promise<Connection> {
    const existing = this.pool.get(tenantId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.connection;
    }

    // Guard against unbounded connection growth across many tenants.
    if (this.pool.size >= this.maxConnections) {
      await this.pruneIdle();
      if (this.pool.size >= this.maxConnections) {
        logger.error(
          `Tenant connection pool at capacity (${this.pool.size}/${this.maxConnections}); rejecting new tenant connection`,
        );
        throw new Error('Too many tenant connections');
      }
    }

    const connection = mongoose.createConnection(this.tenantUri(dbName), {
      minPoolSize: 0,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });
    await connection.asPromise();

    const models = createTenantModels(connection);
    this.pool.set(tenantId, { connection, models, lastUsed: Date.now() });
    logger.info(`Tenant connection established: ${tenantId} -> ${dbName}`);
    return connection;
  }

  getConnection(tenantId: string): Connection | undefined {
    return this.pool.get(tenantId)?.connection;
  }

  getModels(tenantId: string): TenantModels | undefined {
    return this.pool.get(tenantId)?.models;
  }

  async disconnectTenant(tenantId: string): Promise<void> {
    const entry = this.pool.get(tenantId);
    if (!entry) return;
    this.pool.delete(tenantId);
    await entry.connection.close();
    logger.info(`Tenant connection closed: ${tenantId}`);
  }

  connectionPool(): string[] {
    return Array.from(this.pool.keys());
  }

  /**
   * Pool diagnostics for the admin health endpoint (Part 9/15 of Phase 4):
   * verifies tenant connections cannot grow indefinitely.
   */
  stats(): { active: number; max: number; tenants: Array<{ tenantId: string; idleSeconds: number }> } {
    const now = Date.now();
    return {
      active: this.pool.size,
      max: this.maxConnections,
      tenants: Array.from(this.pool.entries()).map(([tenantId, e]) => ({
        tenantId,
        idleSeconds: Math.max(0, Math.round((now - e.lastUsed) / 1000)),
      })),
    };
  }

  /** Evict idle connections. Returns the number of closed tenants. */
  async pruneIdle(maxIdleMs = this.expiryMs): Promise<number> {
    const now = Date.now();
    const idle = Array.from(this.pool.entries()).filter(
      ([, e]) => now - e.lastUsed > maxIdleMs,
    );
    await Promise.all(idle.map(([id]) => this.disconnectTenant(id)));
    return idle.length;
  }

  async shutdown(): Promise<void> {
    await Promise.all(Array.from(this.pool.keys()).map((id) => this.disconnectTenant(id)));
  }
}

export const tenantConnectionManager = new TenantConnectionManager();