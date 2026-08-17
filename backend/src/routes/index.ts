import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import tenantRoutes from './tenant.routes';
import dashboardRoutes from './dashboard.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'ledgerguard-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tenants', tenantRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;