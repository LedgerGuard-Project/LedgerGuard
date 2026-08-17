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

  /** Build a MongoDB URI pointed at a dedicated tenant database. */
  private tenantUri(dbName: string): string {
    const base = config.mongoBaseUri.endsWith('/')
      ? config.mongoBaseUri.slice(0, -1)
      : config.mongoBaseUri;
    return `${base}/${dbName}`;
  }

  async connectTenant(tenantId: string, dbName: string): Promise<Connection> {
    const existing = this.pool.get(tenantId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.connection;
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