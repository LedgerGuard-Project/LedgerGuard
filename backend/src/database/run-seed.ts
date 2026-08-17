import { connectGlobalDatabase, disconnectGlobalDatabase } from './connect';
import { cache } from './cache';
import { tenantConnectionManager } from './TenantConnectionManager';
import { seedPlatform } from './seed';
import { logger } from '../utils/logger';

/**
 * Standalone seed runner: `npm run seed`.
 *
 * Connects to MongoDB, seeds the default organization and development admin
 * account (idempotent — safe to re-run), then closes every connection.
 */
async function runSeed(): Promise<void> {
  await connectGlobalDatabase();
  await cache.init();
  await seedPlatform();
  await tenantConnectionManager.shutdown();
  await disconnectGlobalDatabase();
  logger.info('Seed completed successfully');
}

runSeed()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error('Seed failed', { err });
    void tenantConnectionManager
      .shutdown()
      .finally(() => disconnectGlobalDatabase())
      .finally(() => process.exit(1));
  });
