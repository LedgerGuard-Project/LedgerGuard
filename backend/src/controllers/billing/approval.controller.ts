import type { Response } from 'express';
import { SOCKET_EVENTS } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createApproval,
  listApprovals,
  approveApproval,
  rejectApproval,
  cancelApproval,
} from '../../services/billing/approval.service';
import { serializeApproval } from '../../services/billing/serializers';
import { emitTenantEvent } from '../../sockets/eventBus';

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const approval = await createApproval(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    req.body,
  );
  emitTenantEvent(req.tc!.tenant.tenantId, SOCKET_EVENTS.approvalCreated, {
    approvalId: approval.approvalId,
    resourceType: approval.resourceType,
    resourceId: approval.resourceId,
  });
  res.status(201).json({ success: true, data: { approval: serializeApproval(approval) } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const status = (req.query.status as string) || undefined;
  const approvals = await listApprovals(req.tc!.models.billing, req.tc!.tenant.tenantId, status);
  res.json({ success: true, data: { items: approvals.map((a) => serializeApproval(a)) } });
});

export const approve = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const approval = await approveApproval(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.tc!.models as unknown as { findById: (id: unknown) => Promise<{ role?: string } | null> },
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.approvalId,
  );
  res.json({ success: true, data: { approval: serializeApproval(approval) } });
});

export const reject = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const approval = await rejectApproval(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.tc!.models as unknown as { findById: (id: unknown) => Promise<{ role?: string } | null> },
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.approvalId,
    req.body.reason,
  );
  res.json({ success: true, data: { approval: serializeApproval(approval) } });
});

export const cancel = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const approval = await cancelApproval(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.tc!.models as unknown as { findById: (id: unknown) => Promise<{ role?: string } | null> },
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.approvalId,
  );
  res.json({ success: true, data: { approval: serializeApproval(approval) } });
});