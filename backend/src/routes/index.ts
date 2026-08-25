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
import { config } from '../config';
import { redisService } from '../services/redis/RedisService';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'ledgerguard-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      infrastructure: {
        redis: {
          enabled: config.redisEnabled,
          status: redisService.status,
          lastError: redisService.lastError,
        },
        lockFailurePolicy: config.lockFailurePolicy,
        devSimulationEnabled: config.devSimulationEnabled,
      },
    },
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tenants', tenantRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/billing', billingRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/alerts', alertsRoutes);
router.use('/reports', reportCenterRoutes);
router.use('/dev', devRoutes);

export default router;