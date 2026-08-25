import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import { retryFailedCharge } from '../../services/billing/retry.service';

export const retryPayment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await retryFailedCharge(
    req.tc!.connection,
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.transactionId,
    { ip: req.ip, userAgent: req.get('user-agent') },
  );
  res.json({ success: true, data: result });
});