import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/user.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { UserRole } from '@ledgerguard/shared';

const router = Router();

const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  role: z.enum(['company_admin', 'finance_manager', 'viewer']),
});

const roleSchema = z.object({
  role: z.enum(['company_admin', 'finance_manager', 'viewer']),
});

const statusSchema = z.object({
  status: z.enum(['active', 'disabled']),
});

router.use(authenticate);
router.get('/', requireRole(UserRole.CompanyAdmin), controller.listUsers);
router.post('/', requireRole(UserRole.CompanyAdmin), validate(createUserSchema), controller.createUser);
router.patch('/:id/role', requireRole(UserRole.CompanyAdmin), validate(roleSchema), controller.updateRole);
router.patch('/:id/status', requireRole(UserRole.CompanyAdmin), validate(statusSchema), controller.updateStatus);

export default router;