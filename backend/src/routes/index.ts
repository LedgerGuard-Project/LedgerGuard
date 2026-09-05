import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import tenantRoutes from './tenant.routes';
import dashboardRoutes from './dashboard.routes';
import billingRoutes from './billing.routes';
import devRoutes from './dev.routes';
import analyticsRoutes from './analytics.routes';
import alertsRoutes from './alerts.routes';
import reportCenterRoutes from './reportCenter.routes';
import developerRoutes from './developer.routes';
import operationsRoutes from './operations.routes';
import enterpriseRoutes from './enterprise.routes';
import { config } from '../config';
import { redisService } from '../services/redis/RedisService';
import { tenantConnectionManager } from '../database/TenantConnectionManager';
import healthProbes from './healthProbes';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { UserRole } from '@ledgerguard/shared';
import { asyncHandler } from '../utils/asyncHandler';
import type { AuthenticatedRequest } from '../types';
import { getIo, isSocketsReady } from '../sockets/eventBus';
import { workerHealth } from '../workers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const router = Router();

/** App version resolved once at boot (package.json of the backend cwd). */
const APP_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

const READY_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/** Round-trip MongoDB ping measured server-side; never throws. */
async function mongoPing(timeoutMs = 1500): Promise<{ ok: boolean; latencyMs: number | null; readyState: number }> {
  const start = performance.now();
  try {
    const { mongoose } = await import('../database/connect');
    const conn = mongoose.connection;
    if (conn.readyState !== 1 || !conn.db) {
      return { ok: false, latencyMs: null, readyState: conn.readyState };
    }
    const timer = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('mongo ping timeout')), timeoutMs);
    });
    await Promise.race([conn.db.command({ ping: 1 }), timer]);
    return { ok: true, latencyMs: Math.round(performance.now() - start), readyState: conn.readyState };
  } catch {
    return { ok: false, latencyMs: null, readyState: -1 };
  }
}

// Liveness & readiness — shared implementation also mounted at the service
// root in app.ts for load balancers / orchestrators.
router.use('/health', healthProbes);

/**
 * Multi-document transactions require a replica set. Probed via the MongoDB
 * "hello" command so Phase 2 transactional guarantees are reported honestly
 * rather than assumed.
 */
async function transactionsSupported(): Promise<boolean> {
  try {
    const { mongoose } = await import('../database/connect');
    const admin = mongoose.connection.db?.admin();
    if (!admin) return false;
    const hello = (await admin.command({ hello: 1 })) as { setName?: string };
    return Boolean(hello?.setName);
  } catch {
    return false;
  }
}

// Detailed infrastructure health — RESTRICTED to platform super admins so it can
// never leak topology/policy details to normal company users.
router.get('/health', authenticate, requireRole(UserRole.SuperAdmin), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const [mongo, txSupport] = await Promise.all([mongoPing(), transactionsSupported()]);
  let redisLatencyMs: number | null = null;
  if (redisService.isAvailable) {
    try {
      redisLatencyMs = await redisService.ping();
    } catch {
      redisLatencyMs = null;
    }
  }

  res.json({
    success: true,
    data: {
      status: mongo.ok ? 'ok' : 'degraded',
      service: 'ledgerguard-api',
      version: APP_VERSION,
      env: config.env,
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1048576),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576),
      },
      timestamp: new Date().toISOString(),
      requestId: req.id,
      dependencies: {
        database: {
          state: READY_STATES[mongo.readyState] ?? 'unknown',
          ok: mongo.ok,
          latencyMs: mongo.latencyMs,
          transactionsSupported: txSupport,
        },
        redis: {
          enabled: config.redisEnabled,
          state: redisService.status,
          latencyMs: redisLatencyMs,
        },
        lockFailurePolicy: config.lockFailurePolicy,
        devSimulationEnabled: config.devSimulationEnabled,
      },
      tenantConnections: tenantConnectionManager.stats(),
      sockets: {
        ready: isSocketsReady(),
        connectedClients: getIo()?.engine.clientsCount ?? 0,
      },
      workers: workerHealth(),
    },
  });
}));

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tenants', tenantRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/billing', billingRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/alerts', alertsRoutes);
router.use('/reports', reportCenterRoutes);
router.use('/developer', developerRoutes);
router.use('/operations', operationsRoutes);
router.use('/enterprise', enterpriseRoutes);
router.use('/dev', devRoutes);

export default router;