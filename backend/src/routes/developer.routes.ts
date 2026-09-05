import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@ledgerguard/shared';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import * as apiKeyController from '../controllers/apiKey.controller';
import * as webhookController from '../controllers/webhook.controller';

const router = Router();

router.use(authenticate);

// ---- API keys (Company Admin and above; audited) ----
const createKeySchema = z.object({
  name: z.string().min(1).max(120),
  permissions: z.array(z.enum(['READ', 'WRITE', 'BILLING', 'PAYMENTS', 'REPORTS', 'WEBHOOKS', 'ADMIN'])).min(1),
  expiresAt: z.string().datetime().optional(),
});

router.get('/api-keys', requireRole(UserRole.CompanyAdmin), apiKeyController.listKeys);
router.post('/api-keys', requireRole(UserRole.CompanyAdmin), validate(createKeySchema), apiKeyController.createKey);
router.post('/api-keys/:keyId/revoke', requireRole(UserRole.CompanyAdmin), apiKeyController.revokeKey);
router.post('/api-keys/:keyId/rotate', requireRole(UserRole.CompanyAdmin), apiKeyController.rotateKey);

// ---- Webhook endpoints (Finance Manager and above; audited) ----
const createWebhookSchema = z.object({
  url: z.string().min(1).max(500),
  description: z.string().max(300).optional(),
  events: z.array(z.string()).min(1),
});
const updateWebhookSchema = z.object({
  url: z.string().min(1).max(500).optional(),
  description: z.string().max(300).optional(),
  events: z.array(z.string()).min(1).optional(),
  active: z.boolean().optional(),
});

router.get('/webhooks', requireRole(UserRole.FinanceManager), webhookController.listWebhooks);
router.post('/webhooks', requireRole(UserRole.FinanceManager), validate(createWebhookSchema), webhookController.createWebhook);
router.patch('/webhooks/:endpointId', requireRole(UserRole.FinanceManager), validate(updateWebhookSchema), webhookController.updateWebhook);
router.post('/webhooks/:endpointId/rotate-secret', requireRole(UserRole.CompanyAdmin), webhookController.rotateWebhookSecret);
router.post('/webhooks/:endpointId/test', requireRole(UserRole.FinanceManager), webhookController.testWebhook);
router.get('/webhooks/:endpointId/deliveries', requireRole(UserRole.FinanceManager), webhookController.webhookDeliveries);
router.post('/webhooks/deliveries/:deliveryId/retry', requireRole(UserRole.FinanceManager), webhookController.retryWebhookDelivery);

export default router;