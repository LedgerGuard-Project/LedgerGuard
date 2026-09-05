import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import apiRouter from './routes';
import healthProbes from './routes/healthProbes';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { requestId, REQUEST_ID_HEADER } from './middleware/requestId';
import { logger } from './utils/logger';
import { validateConfig } from './config';

/** Build and configure the Express application. */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
      exposedHeaders: [REQUEST_ID_HEADER],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

    // Correlation ID — must be the first middleware so all downstream logs carry it.
  app.use(requestId());

  if (config.env !== 'test') {
    morgan.token('id', (req: express.Request) => (req as any).id ?? '');
    morgan.token('tenant', (req: express.Request) => (req as any).authUser?.tenantId ?? '-');
    morgan.token('user', (req: express.Request) => (req as any).authUser?.id ?? '-');
    app.use(
      morgan(config.env === 'production' ? 'combined' : 'dev', {
        stream: { write: (line: string) => logger.info(line.trim()) },
      }),
    );
  }

  // Root-level liveness/readiness for LB & orchestrator probes. Mounted before
  // the global rate limiter so infrastructure monitoring is never throttled.
  app.use('/health', healthProbes);

  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' },
      },
    }),
  );

  app.use(config.apiBasePath, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

// Run config validation at module load time.
validateConfig();
