import {
  DEFAULT_SLA_HOURS,
  EXCEPTION_TYPES,
  SOCKET_EVENTS,
  type ExceptionActor,
  type ExceptionSeverity,
  type ExceptionStatus,
  type ExceptionType,
} from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import type { PaymentExceptionDocument } from '../../models/billing/PaymentException';
import { ApiError } from '../../utils/ApiError';
import { newExceptionId } from '../../utils/ids';
import { evaluateSla, slaDeadline, type SlaEvaluation } from '../../utils/sla';
import { emitTenantEvent } from '../../sockets/eventBus';

export interface CreateExceptionInput {
  type: ExceptionType;
  severity?: ExceptionSeverity;
  paymentId?: string;
  invoiceId?: string;
  customerId?: string;
  bankTransactionId?: string;
  amountMinor: number;
  currency: string;
  reason: string;
  /** Optional SLA override (hours). Falls back to the type policy. */
  slaHours?: number;
}

export interface ExceptionFilters {
  status?: ExceptionStatus;
  type?: ExceptionType;
  severity?: ExceptionSeverity;
  assignedToMe?: string;
  page: number;
  perPage: number;
  skip: number;
}

export type SerializedException = ReturnType<typeof serializeException>;

function serializeException(doc: PaymentExceptionDocument) {
  const json = doc.toJSON() as Record<string, unknown>;
  const closed = doc.status === 'resolved' || doc.status === 'ignored';
  const sla = evaluateSla(doc.createdAt, doc.dueAt, closed ? doc.resolvedAt ?? doc.updatedAt : null);
  return { ...json, sla };
}

export async function createException(
  models: BillingModels,
  tenantId: string,
  input: CreateExceptionInput,
): Promise<PaymentExceptionDocument> {
  if (!EXCEPTION_TYPES.includes(input.type)) {
    throw ApiError.badRequest('Unsupported exception type', 'INVALID_EXCEPTION_TYPE');
  }
  const now = new Date();
  const slaHours =
    input.slaHours && input.slaHours > 0
      ? input.slaHours
      : (DEFAULT_SLA_HOURS.payment_exception ?? 4);
  const doc = await models.PaymentException.create({
    exceptionId: newExceptionId(),
    tenantId,
    type: input.type,
    severity: input.severity ?? 'medium',
    status: 'open',
    paymentId: input.paymentId?.trim() || undefined,
    invoiceId: input.invoiceId?.trim() || undefined,
    customerId: input.customerId?.trim() || undefined,
    bankTransactionId: input.bankTransactionId?.trim() || undefined,
    amountMinor: Math.round(input.amountMinor),
    currency: input.currency.toUpperCase(),
    reason: input.reason.trim(),
    dueAt: slaDeadline(now, slaHours),
  });
  emitTenantEvent(tenantId, SOCKET_EVENTS.exceptionCreated, {
    exceptionId: doc.exceptionId,
    type: doc.type,
    severity: doc.severity,
  });
  return doc;
}

export async function listExceptions(
  models: BillingModels,
  tenantId: string,
  filters: ExceptionFilters,
): Promise<{ items: SerializedException[]; total: number }> {
  const query: Record<string, unknown> = { tenantId };
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.severity) query.severity = filters.severity;
  if (filters.assignedToMe) query['assignedTo.id'] = filters.assignedToMe;

  const [docs, total] = await Promise.all([
    models.PaymentException.find(query)
      .sort({ createdAt: -1 })
      .skip(filters.skip)
      .limit(filters.perPage),
    models.PaymentException.countDocuments(query),
  ]);
  return { items: docs.map(serializeException), total };
}

export async function getException(
  models: BillingModels,
  tenantId: string,
  exceptionId: string,
): Promise<PaymentExceptionDocument> {
  const doc = await models.PaymentException.findOne({ tenantId, exceptionId });
  if (!doc) {
    throw ApiError.notFound('Exception not found', 'EXCEPTION_NOT_FOUND');
  }
  return doc;
}

function assertActionable(doc: PaymentExceptionDocument, allowed: ExceptionStatus[]): void {
  if (!allowed.includes(doc.status)) {
    throw ApiError.conflict(
      `Exception is ${doc.status}; cannot perform this action`,
      'EXCEPTION_INVALID_STATE',
    );
  }
}

export async function assignException(
  models: BillingModels,
  tenantId: string,
  exceptionId: string,
  assignee: ExceptionActor,
): Promise<PaymentExceptionDocument> {
  const doc = await getException(models, tenantId, exceptionId);
  assertActionable(doc, ['open', 'investigating']);
  doc.assignedTo = assignee;
  await doc.save();
  emitTenantEvent(tenantId, SOCKET_EVENTS.exceptionUpdated, {
    exceptionId: doc.exceptionId,
    status: doc.status,
    assignedTo: assignee,
  });
  return doc;
}

export async function investigateException(
  models: BillingModels,
  tenantId: string,
  exceptionId: string,
): Promise<PaymentExceptionDocument> {
  const doc = await getException(models, tenantId, exceptionId);
  assertActionable(doc, ['open', 'investigating']);
  doc.status = 'investigating';
  await doc.save();
  emitTenantEvent(tenantId, SOCKET_EVENTS.exceptionUpdated, {
    exceptionId: doc.exceptionId,
    status: doc.status,
  });
  return doc;
}

/**
 * Resolve (or ignore) an exception. A reason is mandatory. Idempotency:
 * resolving an already-resolved exception raises 409 instead of duplicating.
 */
export async function resolveException(
  models: BillingModels,
  tenantId: string,
  exceptionId: string,
  actor: ExceptionActor,
  resolution: string,
  ignore = false,
): Promise<PaymentExceptionDocument> {
  if (!resolution || resolution.trim().length < 3) {
    throw ApiError.badRequest('A resolution reason is required', 'RESOLUTION_REQUIRED');
  }
  const doc = await getException(models, tenantId, exceptionId);
  assertActionable(doc, ['open', 'investigating']);
  doc.status = ignore ? 'ignored' : 'resolved';
  doc.resolvedBy = actor;
  doc.resolution = resolution.trim();
  doc.resolvedAt = new Date();
  await doc.save();
  emitTenantEvent(tenantId, SOCKET_EVENTS.exceptionUpdated, {
    exceptionId: doc.exceptionId,
    status: doc.status,
  });
  return doc;
}

/** Reopen a resolved/ignored exception; the reopen reason is mandatory. */
export async function reopenException(
  models: BillingModels,
  tenantId: string,
  exceptionId: string,
  reason: string,
): Promise<PaymentExceptionDocument> {
  if (!reason || reason.trim().length < 3) {
    throw ApiError.badRequest('A reopen reason is required', 'REOPEN_REASON_REQUIRED');
  }
  const doc = await getException(models, tenantId, exceptionId);
  if (doc.status !== 'resolved' && doc.status !== 'ignored') {
    throw ApiError.conflict(
      'Only resolved or ignored exceptions can be reopened',
      'EXCEPTION_INVALID_STATE',
    );
  }
  doc.status = 'open';
  doc.assignedTo = undefined;
  doc.resolvedBy = undefined;
  doc.resolution = undefined;
  doc.resolvedAt = undefined;
  doc.reason = `${doc.reason}\n[reopened] ${reason.trim()}`;
  doc.dueAt = slaDeadline(new Date(), DEFAULT_SLA_HOURS.payment_exception ?? 4);
  await doc.save();
  emitTenantEvent(tenantId, SOCKET_EVENTS.exceptionUpdated, {
    exceptionId: doc.exceptionId,
    status: doc.status,
  });
  return doc;
}

/** Serialize with computed SLA for API responses. */
export function serialize(doc: PaymentExceptionDocument): SerializedException {
  return serializeException(doc);
}