import { Router } from 'express';
import { z } from 'zod';
import type { Response } from 'express';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { distributedLockService } from '../services/DistributedLockService';
import { redisService } from '../services/redis/RedisService';
import { transactionsSupported } from '../services/billing/payment.service';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';

/**
 * DEVELOPMENT-ONLY failure simulation. Every route is a no-op with a 403 when
 * DEV_SIMULATION_ENABLED is false (the production default). These endpoints let
 * developers verify lock contention, duplicate payments and DB rollback without
 * touching real customer data.
 */
const router = Router();

router.use(authenticate);

const requireDevSimulation = (req: AuthenticatedRequest, _res: Response, next: () => void): void => {
  if (!config.devSimulationEnabled) {
    throw ApiError.forbidden(
      'Failure simulation is disabled in this environment',
      'DEV_SIMULATION_DISABLED',
    );
  }
  next();
};

router.use(requireDevSimulation);

const lockKeySchema = z.object({
  tenantId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

/** Show the exact distributed-lock key used for a (tenant, idempotency key) pair. */
router.post(
  '/lock-key',
  validate(lockKeySchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const key = distributedLockService.lockKey(req.body.tenantId, req.body.idempotencyKey);
    res.json({
      success: true,
      data: {
        key,
        redis: { enabled: config.redisEnabled, status: redisService.status },
        policy: config.lockFailurePolicy,
      },
    });
  }),
);

/** Simulate Redis lock contention: hold the lock for `ttlMs` (default 8s). */
router.post(
  '/lock-contention',
  validate(lockKeySchema.extend({ ttlMs: z.number().min(100).max(60_000).optional() })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId, idempotencyKey, ttlMs } = req.body;
    if (!redisService.isAvailable) {
      throw ApiError.badRequest(
        `Redis is ${redisService.status}; cannot demonstrate real lock contention without Redis.`,
        'REDIS_UNAVAILABLE',
      );
    }
    const acquired = await distributedLockService.acquire(tenantId, idempotencyKey);
    if (!acquired.ok) {
      return res.json({ success: true, data: { held: true, note: 'Lock already held by another request' } });
    }
    // Hold the lock, then release after ttlMs. A concurrent payment with the
    // same idempotency key will observe contention in the meantime.
    setTimeout(() => {
      void distributedLockService.release(tenantId, idempotencyKey, acquired.token as string);
    }, ttlMs ?? 8_000);
    res.json({
      success: true,
      data: {
        held: true,
        note: `Lock acquired and held for ${ttlMs ?? 8_000}ms. Submit a payment with the same idempotency key now to observe LOCK_CONTENTION.`,
        key: distributedLockService.lockKey(tenantId, idempotencyKey),
      },
    });
  }),
);

/**
 * Simulate a database failure inside a transaction. Writes a deliberately
 * invalid ledger entry inside a session: the write fails validation, the
 * session aborts and nothing is persisted — demonstrating safe rollback.
 */
router.post(
  '/transaction-rollback',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const models = req.tc!.models.billing;
    const tenantId = req.tc!.tenant.tenantId;
    const connection = req.tc!.connection;

    if (!(await transactionsSupported(connection))) {
      throw ApiError.badRequest(
        'MongoDB is not running as a replica set, so a transaction cannot be opened here.',
        'TRANSACTIONS_UNSUPPORTED',
      );
    }

    const before = await models.LedgerTransaction.countDocuments({ tenantId });
    const session = await connection.startSession();
    try {
      await session.withTransaction(async () => {
        // amountMinor below the schema minimum => validation error inside txn.
        await models.LedgerTransaction.create(
          [{ transactionId: 'SIM-INVALID', tenantId, customerId: 'n/a', accountId: 'n/a', amountMinor: -5, currency: 'USD', type: 'charge', status: 'completed' }],
          { session },
        );
        throw new Error('simulated post-write failure');
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const after = await models.LedgerTransaction.countDocuments({ tenantId });
      return res.json({
        success: true,
        data: {
          simulated: true,
          outcome: 'rolled_back',
          note: `Transaction aborted (${message}). Documents before=${before} after=${after} — nothing was persisted.`,
        },
      });
    } finally {
      await session.endSession().catch(() => undefined);
    }
  }),
);

export default router;