import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/tenant.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { UserRole } from '@ledgerguard/shared';

const router = Router();

const provisionSchema = z.object({
  tenantId: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'tenantId may only contain a-z, 0-9 and hyphens'),
  companyName: z.string().min(2).max(160),
  ownerName: z.string().min(1).max(120),
  ownerEmail: z.string().email().max(254),
  ownerPassword: z.string().min(8).max(128),
  subscriptionPlan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
});

const updateTenantSchema = z.object({
  subscriptionPlan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
  status: z.enum(['active', 'trialing', 'past_due', 'canceled']).optional(),
});

router.use(authenticate);
router.get('/me', controller.me);
router.get('/pool', requireRole(UserRole.SuperAdmin), controller.poolStatus);
router.post('/:id/disconnect', requireRole(UserRole.SuperAdmin), controller.disconnectTenant);
router.patch('/:id', requireRole(UserRole.SuperAdmin), validate(updateTenantSchema), controller.updateTenant);
router.get('/', requireRole(UserRole.SuperAdmin), controller.listTenants);
router.post('/', requireRole(UserRole.SuperAdmin), validate(provisionSchema), controller.createTenant);

export default router;