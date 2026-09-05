import { Router } from 'express';
import { redisService } from '../services/redis/RedisService';
import { config } from '../config';

/**
 * Liveness & readiness probes.
 *
 * Mounted twice:
 *   - at the service root  (/health/live, /health/ready)  for load balancers,
 *     Kubernetes liveness/readiness probes and uptime monitors;
 *   - under the API prefix (/api/health/live, /api/health/ready) following the
 *     application's existing route conventions.
 *
 * Both endpoints are unauthenticated by design but expose NO infrastructure
 * details beyond coarse status — the detailed endpoint stays SuperAdmin-only.
 */
const router = Router();

router.get('/live', (_req, res) => {
  res.status(200).json({
    success: true,
    data: { status: 'alive', timestamp: new Date().toISOString(), uptime: process.uptime() },
  });
});

router.get('/ready', async (_req, res) => {
  const checks: Record<string, { status: 'ok' | 'down'; detail?: string }> = {};

  // Global DB
  const { mongoose } = await import('../database/connect');
  checks.database =
    mongoose.connection.readyState === 1
      ? { status: 'ok' }
      : { status: 'down', detail: `state=${mongoose.connection.readyState}` };

  // Redis — required when enabled, ignored when disabled
  checks.redis = redisService.isAvailable
    ? { status: 'ok' }
    : { status: config.redisEnabled ? 'down' : 'ok', detail: redisService.status };

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  res.status(allOk ? 200 : 503).json({
    success: allOk,
    data: { status: allOk ? 'ready' : 'degraded', checks, timestamp: new Date().toISOString() },
  });
});

export default router;
