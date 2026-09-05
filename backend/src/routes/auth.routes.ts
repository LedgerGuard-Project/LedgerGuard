import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/authRateLimit';

const router = Router();

const registerSchema = z.object({
  companyName: z.string().min(2).max(160),
  tenantId: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'tenantId may only contain a-z, 0-9 and hyphens')
    .optional(),
  name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  subscriptionPlan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().min(2).optional(),
  companyName: z.string().min(2).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

router.post('/register', authRateLimiter, validate(registerSchema), controller.register);
router.post('/login', authRateLimiter, validate(loginSchema), controller.login);
router.post('/refresh', authRateLimiter, validate(refreshSchema), controller.refresh);
router.post('/logout', authRateLimiter, validate(refreshSchema), controller.logout);
router.get('/me', authenticate, controller.me);

export default router;