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

    // Surface listen failures (e.g. EADDRINUSE) with the actual cause instead
    // of an unhandled event that kills the process silently.
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} is already in use — stop the process holding it or set PORT to another value`, { err });
      } else {
        logger.error('HTTP server error', { err });
      }
      process.exit(1);
    });

    server.listen(config.port, () => {
      logger.info(`LedgerGuard API listening on ${config.host}:${config.port} (${config.env})`);
    });
  } catch (err) {
    // Fail loudly in every environment: a half-initialized process that never
    // listens is worse than a clean crash (dev watchers and process managers
    // can then restart it, and the Vite proxy shows a clear error instead of
    // hanging). Previously dev silently survived bootstrap failures.
    logger.error('Failed to start LedgerGuard API', { err });
    process.exit(1);
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

  // Never swallow async failures: log them with context; an uncaughtException
  // leaves the process in an unsafe state, so shut down gracefully.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { err: reason });
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — shutting down', { err });
    void shutdown('uncaughtException');
  });
}

void bootstrap();