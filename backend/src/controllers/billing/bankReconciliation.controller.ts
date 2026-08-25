import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  importBankRows,
  reconciliationDashboard,
  listBankRows,
  manuallyMatch,
  unmatch,
  setNotes,
  setIgnored,
  type BankImportRow,
} from '../../services/billing/bankReconciliation.service';

/** Import bank rows (CSV parsed upstream into JSON rows). */
export const importRows = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const rows = (req.body.rows ?? []) as BankImportRow[];
  const summary = await importBankRows(
    models,
    tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    rows,
    { ip: req.ip, userAgent: req.get('user-agent') },
  );
  res.status(201).json({ success: true, data: summary });
});

export const dashboard = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await reconciliationDashboard(req.tc!.models.billing, req.tc!.tenant.tenantId);
  res.json({ success: true, data });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await listBankRows(req.tc!.models.billing, req.tc!.tenant.tenantId, {
    status: (req.query.status as string) || undefined,
    batchId: (req.query.batchId as string) || undefined,
    search: (req.query.search as string) || undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    perPage: req.query.perPage ? Number(req.query.perPage) : undefined,
  });
  res.json({ success: true, data });
});

export const match = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await manuallyMatch(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.bankTransactionId,
    req.body.ledgerTransactionId,
    req.body.note,
    { ip: req.ip, userAgent: req.get('user-agent') },
  );
  res.json({ success: true, data: result });
});

export const unMatch = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await unmatch(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.bankTransactionId,
    { ip: req.ip, userAgent: req.get('user-agent') },
  );
  res.json({ success: true, data: result });
});

export const notes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await setNotes(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.bankTransactionId,
    String(req.body.note ?? ''),
  );
  res.json({ success: true, data: result });
});

export const ignore = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await setIgnored(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.bankTransactionId,
    Boolean(req.body.ignored),
    { ip: req.ip, userAgent: req.get('user-agent') },
  );
  res.json({ success: true, data: result });
});