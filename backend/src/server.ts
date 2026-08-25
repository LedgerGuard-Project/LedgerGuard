import http from 'http';
import { config } from './config';
import { createApp } from './app';
import {
  connectGlobalDatabase,
  disconnectGlobalDatabase,
  tenantConnectionManager,
  cache,
  seedPlatform,
} from './database';
import { redisService } from './services/redis/RedisService';
import { attachSockets } from './sockets';
import { startWorkers } from './workers';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  let server: http.Server | undefined;

  try {
    await connectGlobalDatabase();
    await cache.init();
    await seedPlatform();
    if (config.redisEnabled) {
      const status = await redisService.connect();
      logger.info(
        status === 'connected'
          ? 'Redis connected — distributed locking active'
          : 'Redis connection unavailable — distributed locking degraded',
      );
    } else {
      logger.info('Redis disabled — distributed locking unavailable (set REDIS_ENABLED=true to enable)');
    }

    const app = createApp();
    server = http.createServer(app);
    attachSockets(server);
    await startWorkers();

    server.listen(config.port, () => {
      logger.info(`LedgerGuard API listening on ${config.host}:${config.port} (${config.env})`);
    });
  } catch (err) {
    logger.error('Failed to start LedgerGuard API', { err });
    if (config.env === 'production') process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down gracefully`);
    try {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      await tenantConnectionManager.shutdown();
      await disconnectGlobalDatabase();
      await redisService.disconnect();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();