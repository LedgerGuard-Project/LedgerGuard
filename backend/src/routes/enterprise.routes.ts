import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@ledgerguard/shared';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import * as communicationController from '../controllers/communication.controller';
import * as savedViewController from '../controllers/savedView.controller';
import * as complianceController from '../controllers/compliance.controller';
import * as timelineController from '../controllers/timeline.controller';
import * as searchController from '../controllers/search.controller';

const router = Router();

router.use(authenticate);

// ---- Enterprise Search (read, any authenticated user) ----
router.get('/search', searchController.search);

// ---- Communications (Finance Manager and above can create/retry) ----
const createCommunicationSchema = z.object({
  event: z.enum([
    'invoice.sent',
    'payment.confirmation',
    'payment.failed',
    'payment.reminder',
    'overdue.reminder',
    'subscription.renewal',
    'credit_note.notification',
    'refund.notification',
    'system.notification',
  ]),
  channel: z.enum(['in_app', 'email', 'webhook']),
  template: z.string().max(200).optional(),
  recipient: z.object({ customerId: z.string().optional(), email: z.string().email().optional(), userId: z.string().optional() }).optional(),
  vars: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

router.get('/communications', communicationController.list);
router.get('/communications/:communicationId', communicationController.detail);
router.post('/communications', requireRole(UserRole.FinanceManager), validate(createCommunicationSchema), communicationController.create);
router.post('/communications/:communicationId/retry', requireRole(UserRole.FinanceManager), communicationController.retry);

// ---- Saved Views (user-scoped) ----
const createViewSchema = z.object({
  name: z.string().min(1).max(120),
  entity: z.string().min(1).max(60),
  filters: z.array(z.object({ field: z.string(), value: z.union([z.string(), z.number(), z.boolean(), z.null()]) })).optional(),
  columns: z.array(z.string()).optional(),
  sort: z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
});

router.get('/views', savedViewController.list);
router.post('/views', validate(createViewSchema), savedViewController.create);
router.delete('/views/:viewId', savedViewController.remove);

// ---- Compliance Evidence Center (audit/export) ----
const createEvidenceSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  rangeFrom: z.string().optional(),
  rangeTo: z.string().optional(),
  filters: z.array(z.object({ field: z.string(), value: z.string() })).optional(),
});

router.get('/compliance/evidence', requireRole(UserRole.FinanceManager), complianceController.list);
router.get('/compliance/evidence/:evidenceId', requireRole(UserRole.FinanceManager), complianceController.detail);
router.get('/compliance/evidence/:evidenceId/export', requireRole(UserRole.CompanyAdmin), complianceController.exportJson);
router.post('/compliance/evidence', requireRole(UserRole.FinanceManager), validate(createEvidenceSchema), complianceController.create);

// ---- Billing Event Timeline (read any authenticated user) ----
router.get('/timeline/:entityType/:entityId', timelineController.get);

export default router;