import { Router } from 'express';
import * as controller from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/summary', authenticate, controller.summary);

export default router;