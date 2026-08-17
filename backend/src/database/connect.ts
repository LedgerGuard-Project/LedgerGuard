import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Establish the platform-wide (global) MongoDB connection that stores the
 * tenants registry and the audit log. Tenant data lives in its own databases
 * managed by the TenantConnectionManager.
 */
export async function connectGlobalDatabase(): Promise<void> {
  mongoose.connection.on('connected', () => {
    logger.info(`Global database connected: ${config.globalDbName}`);
  });
  mongoose.connection.on('error', (err) => {
    logger.error('Global database connection error', { err });
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('Global database disconnected');
  });

  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
  });
}

export async function disconnectGlobalDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export { mongoose };