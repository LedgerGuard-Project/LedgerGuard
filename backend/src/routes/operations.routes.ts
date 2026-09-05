import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as operationsController from '../controllers/operations.controller';

const router = Router();

router.use(authenticate);

/** Unified finance operations work queue (read; contains no mutations). */
router.get('/queue', operationsController.queue);

/** Month-end close dashboard with real readiness scoring. */
router.get('/close', operationsController.closeDashboard);

export default router;