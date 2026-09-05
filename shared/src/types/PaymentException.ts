import type { ObjectId } from './primitives';

/** Categories of payment/reconciliation exceptions requiring human attention. */
export const EXCEPTION_TYPES = [
  'unmatched_payment',
  'duplicate_payment',
  'failed_payment',
  'partial_payment',
  'amount_mismatch',
  'unknown_customer',
  'unknown_invoice',
  'timeout',
  'webhook_mismatch',
  'status_mismatch',
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const EXCEPTION_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type ExceptionSeverity = (typeof EXCEPTION_SEVERITIES)[number];

/** Lifecycle of a reconciliation/payment exception. */
export const EXCEPTION_STATUSES = ['open', 'investigating', 'resolved', 'ignored'] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

/** SLA statuses computed from real timestamps (never fake timers). */
export const SLA_STATUSES = ['on_track', 'at_risk', 'breached', 'resolved'] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

export interface ExceptionActor {
  id: string;
  email: string;
}

/** A payment/reconciliation exception queued for finance-team triage. */
export interface PaymentException {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "EXC-ab12cd34". */
  exceptionId: string;
  tenantId: string;
  type: ExceptionType;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  paymentId?: string;
  invoiceId?: string;
  customerId?: string;
  /** Bank transaction reference when raised from reconciliation. */
  bankTransactionId?: string;
  amountMinor: number;
  currency: string;
  reason: string;
  assignedTo?: ExceptionActor;
  resolvedBy?: ExceptionActor;
  /** Required when a resolution is recorded. */
  resolution?: string;
  resolvedAt?: string;
  /** Absolute SLA deadline derived from the type policy at creation. */
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
}