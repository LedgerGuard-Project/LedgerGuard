import { SOCKET_EVENTS, AuditAction, APPROVAL_RESOURCE_TYPES } from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import type { ApprovalRequestDocument } from '../../models/billing/ApprovalRequest';
import { ApiError } from '../../utils/ApiError';
import { newApprovalId } from '../../utils/ids';
import { createNotification } from './notification.service';
import { writeAudit } from '../audit.service';
import { emitTenantEvent } from '../../sockets/eventBus';
import { logger } from '../../utils/logger';

export interface CreateApprovalInput {
  resourceType: typeof APPROVAL_RESOURCE_TYPES[number];
  resourceId: string;
  resourceName?: string;
  amountMinor: number;
  currency: string;
  thresholdMinor: number;
  metadata?: Record<string, unknown>;
  paymentMethod?: string;
}

export interface Approver {
  id: string;
  email: string;
}

const MIN_AMOUNT_MINOR = 1;

function assertPositive(value: number, label: string, code: string): void {
  if (!Number.isFinite(value) || value < MIN_AMOUNT_MINOR) {
    throw ApiError.badRequest(`${label} must be a positive amount`, code);
  }
}

/** Weight used to enforce approval authorization (finance_manager and above approve). */
function roleApprovalWeight(role: string | undefined): number {
  switch (role) {
    case 'super_admin':
    case 'company_admin':
      return 100;
    case 'finance_manager':
      return 60;
    case 'accountant':
      return 20;
    default:
      return 0;
  }
}

/** Minimal user model surface used for role lookups. */
export interface UserModel {
  findById(id: unknown): Promise<{ role?: string } | null>;
}

async function userRole(userModel: UserModel, userId: string): Promise<string | undefined> {
  const user = await userModel.findById(userId);
  return user?.role;
}

export async function createApproval(
  models: BillingModels,
  tenantId: string,
  requester: Approver,
  input: CreateApprovalInput,
): Promise<ApprovalRequestDocument> {
  if (!APPROVAL_RESOURCE_TYPES.includes(input.resourceType)) {
    throw ApiError.badRequest('Unsupported resource type for approval', 'INVALID_RESOURCE_TYPE');
  }
  assertPositive(input.amountMinor, 'amountMinor', 'INVALID_AMOUNT');
  assertPositive(input.thresholdMinor, 'thresholdMinor', 'INVALID_THRESHOLD');
  return models.ApprovalRequest.create({
    approvalId: newApprovalId(),
    tenantId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    resourceName: input.resourceName?.trim(),
    requesterId: requester.id,
    requesterEmail: requester.email,
    amountMinor: Math.round(input.amountMinor),
    currency: input.currency.toUpperCase(),
    thresholdMinor: Math.round(input.thresholdMinor),
    status: 'pending',
    metadata: input.metadata,
    paymentMethod: input.paymentMethod as ApprovalRequestDocument['paymentMethod'],
  });
}

export async function listApprovals(
  models: BillingModels,
  tenantId: string,
  status?: string,
): Promise<ApprovalRequestDocument[]> {
  const filter: Record<string, unknown> = { tenantId };
  if (status) filter.status = status;
  return models.ApprovalRequest.find(filter).sort({ createdAt: -1 }).limit(200);
}

export async function getApproval(
  models: BillingModels,
  tenantId: string,
  approvalId: string,
): Promise<ApprovalRequestDocument> {
  const approval = await models.ApprovalRequest.findOne({ tenantId, approvalId });
  if (!approval) throw ApiError.notFound('Approval request not found', 'APPROVAL_NOT_FOUND');
  return approval;
}

async function assertNotRequester(
  approval: ApprovalRequestDocument,
  actorId: string,
): Promise<void> {
  if (approval.requesterId === actorId) {
    throw ApiError.forbidden(
      'You cannot approve or reject your own request (segregation of duties)',
      'SELF_APPROVAL_NOT_ALLOWED',
    );
  }
}

async function assertCanActOnApproval(
  userModel: UserModel,
  actorId: string,
): Promise<void> {
  const role = await userRole(userModel, actorId);
  if (roleApprovalWeight(role) < roleApprovalWeight('finance_manager')) {
    throw ApiError.forbidden(
      'Insufficient permissions to approve financial requests',
      'INSUFFICIENT_ROLE',
    );
  }
}

async function assertIsAdmin(
  userModel: UserModel,
  actorId: string,
): Promise<void> {
  const role = await userRole(userModel, actorId);
  if (role !== 'company_admin' && role !== 'super_admin') {
    throw ApiError.forbidden('Only an admin can perform this action', 'INSUFFICIENT_ROLE');
  }
}
// __APPROVE_FNS__
export async function approveApproval(
  models: BillingModels,
  tenantId: string,
  userModel: UserModel,
  actor: Approver,
  approvalId: string,
): Promise<ApprovalRequestDocument> {
  const approval = await getApproval(models, tenantId, approvalId);
  if (approval.status !== 'pending') {
    throw ApiError.badRequest(`Approval is already ${approval.status}`, 'APPROVAL_NOT_PENDING');
  }
  await assertCanActOnApproval(userModel, actor.id);
  await assertNotRequester(approval, actor.id);
  approval.status = 'approved';
  approval.approverId = actor.id;
  approval.approverEmail = actor.email;
  await approval.save();

  emitTenantEvent(tenantId, SOCKET_EVENTS.approvalApproved, {
    approvalId: approval.approvalId,
    resourceType: approval.resourceType,
    resourceId: approval.resourceId,
  });
  await createNotification(models, tenantId, {
    type: 'approval',
    title: 'Approval approved',
    message: `${approval.resourceName ?? approval.resourceId} was approved`,
    data: { approvalId: approval.approvalId },
  });
  await writeAudit({
    tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.ApprovalApproved,
    resource: 'approval',
    resourceId: approval.approvalId,
    details: { resourceType: approval.resourceType, resourceId: approval.resourceId },
    ip: undefined,
  }).catch((auditErr) => logger.warn('audit ApprovalApproved failed', { auditErr }));
  return approval;
}

export async function rejectApproval(
  models: BillingModels,
  tenantId: string,
  userModel: UserModel,
  actor: Approver,
  approvalId: string,
  reason?: string,
): Promise<ApprovalRequestDocument> {
  const approval = await getApproval(models, tenantId, approvalId);
  if (approval.status !== 'pending') {
    throw ApiError.badRequest(`Approval is already ${approval.status}`, 'APPROVAL_NOT_PENDING');
  }
  await assertCanActOnApproval(userModel, actor.id);
  await assertNotRequester(approval, actor.id);
  approval.status = 'rejected';
  approval.approverId = actor.id;
  approval.approverEmail = actor.email;
  approval.rejectionReason = reason?.trim();
  await approval.save();

  emitTenantEvent(tenantId, SOCKET_EVENTS.approvalRejected, {
    approvalId: approval.approvalId,
    resourceType: approval.resourceType,
    resourceId: approval.resourceId,
    reason: approval.rejectionReason,
  });
  await createNotification(models, tenantId, {
    type: 'approval',
    title: 'Approval rejected',
    message: `${approval.resourceName ?? approval.resourceId} was rejected${reason ? `: ${reason}` : ''}`,
    data: { approvalId: approval.approvalId },
  });
  await writeAudit({
    tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.ApprovalRejected,
    resource: 'approval',
    resourceId: approval.approvalId,
    details: { resourceType: approval.resourceType, resourceId: approval.resourceId, reason },
    ip: undefined,
  }).catch((auditErr) => logger.warn('audit ApprovalRejected failed', { auditErr }));
  return approval;
}

export async function cancelApproval(
  models: BillingModels,
  tenantId: string,
  userModel: UserModel,
  actor: Approver,
  approvalId: string,
): Promise<ApprovalRequestDocument> {
  const approval = await getApproval(models, tenantId, approvalId);
  if (approval.status !== 'pending') {
    throw ApiError.badRequest(`Approval is already ${approval.status}`, 'APPROVAL_NOT_PENDING');
  }
  if (approval.requesterId !== actor.id) {
    await assertIsAdmin(userModel, actor.id);
  }
  approval.status = 'cancelled';
  await approval.save();
  await writeAudit({
    tenantId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.ApprovalCancelled,
    resource: 'approval',
    resourceId: approval.approvalId,
    ip: undefined,
  }).catch((auditErr) => logger.warn('audit ApprovalCancelled failed', { auditErr }));
  return approval;
}