import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import {
  reconcileBillingLedger,
  getReconciliationByKey,
} from '../../services/billing/reconciliation.service';
import { generateIdempotencyKey } from '../../services/idempotency.service';

function idempotencyKeyFrom(req: AuthenticatedRequest): string {
  const header = req.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;
  if (value && typeof value === 'string' && value.trim().length > 0) {
    return value.trim().slice(0, 200);
  }
  return generateIdempotencyKey();
}

/** Run an idempotent, lock-guarded ledger reconciliation (optionally with repair). */
export const createReconciliation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const key = idempotencyKeyFrom(req);
  const result = await reconcileBillingLedger(
    req.tc!.connection,
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    { ...req.body, idempotencyKey: key },
    { ip: req.ip, userAgent: req.get('user-agent') },
  );

  if (result.idempotencyStatus === 'processing' && result.replay !== true) {
    return res.status(202).json({
      success: true,
      data: { status: 'processing', message: 'Reconciliation is already being processed', idempotencyKey: key },
    });
  }
  const status = result.replay === true ? 200 : 201;
  res.status(status).json({ success: true, data: result });
});

/** Fetch the stored result of a prior reconciliation by its Idempotency-Key. */
export const getReconciliation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await getReconciliationByKey(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.key,
  );
  if (!result) {
    throw ApiError.notFound('No completed reconciliation found for this key', 'RECONCILIATION_NOT_FOUND');
  }
  res.json({ success: true, data: result });
});