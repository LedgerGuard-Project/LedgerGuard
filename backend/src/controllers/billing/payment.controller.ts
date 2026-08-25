import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import { processPayment, processRefund, type PaymentResult } from '../../services/billing/payment.service';
import { fromMinor, roundMoney } from '../../utils/money';
import { generateIdempotencyKey } from '../../services/idempotency.service';

function idempotencyKeyFrom(req: AuthenticatedRequest): string {
  const header = req.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;
  if (value && typeof value === 'string' && value.trim().length > 0) {
    return value.trim().slice(0, 200);
  }
  const bodyKey = req.body?.idempotencyKey;
  if (typeof bodyKey === 'string' && bodyKey.trim().length > 0) {
    return bodyKey.trim().slice(0, 200);
  }
  return generateIdempotencyKey();
}

export const createPayment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const key = idempotencyKeyFrom(req);
  const result: PaymentResult = await processPayment(
    req.tc!.connection,
    models,
    tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    { ...req.body, idempotencyKey: key },
    { ip: req.ip, userAgent: req.get('user-agent') },
  );

  if (result.status === 'processing' && result.replay !== true) {
    return res.status(202).json({
      success: true,
      data: { status: 'processing', message: 'Payment is already being processed', idempotencyKey: key },
    });
  }
  const status = result.replay === true ? 200 : 201;
  res.status(status).json({ success: true, data: result });
});

export const listPayments = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.perPage) || 20));
  const filter: Record<string, unknown> = { tenantId };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.customerId) filter.customerId = req.query.customerId;
  if (req.query.from || req.query.to) {
    const range: Record<string, Date> = {};
    if (req.query.from) range.$gte = new Date(String(req.query.from));
    if (req.query.to) range.$lte = new Date(String(req.query.to));
    filter.createdAt = range;
  }
  const [items, total] = await Promise.all([
    models.LedgerTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage),
    models.LedgerTransaction.countDocuments(filter),
  ]);
  res.json({
    success: true,
    data: {
      items: items.map((t) => ({ ...t.toJSON(), amount: roundMoney(fromMinor(t.amountMinor)) })),
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    },
  });
});

export const refundPayment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const key = idempotencyKeyFrom(req);
  const result: PaymentResult = await processRefund(
    req.tc!.connection,
    models,
    tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.transactionId,
    { ...req.body, idempotencyKey: key },
    { ip: req.ip, userAgent: req.get('user-agent') },
  );
  if (result.status === 'processing' && result.replay !== true) {
    return res.status(202).json({
      success: true,
      data: { status: 'processing', message: 'Refund is already being processed', idempotencyKey: key },
    });
  }
  const status = result.replay === true ? 200 : 201;
  res.status(status).json({ success: true, data: result });
});