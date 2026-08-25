import type { ObjectId } from './primitives';
import type { PaymentMethod } from './LedgerTransaction';

/** Resources that can require an approval workflow. */
export const APPROVAL_RESOURCE_TYPES = [
  'invoice',
  'credit_note',
  'debit_note',
  'payment',
  'refund',
] as const;
export type ApprovalResourceType = (typeof APPROVAL_RESOURCE_TYPES)[number];

/** Lifecycle of an approval request. */
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/**
 * An approval request raised for a sensitive financial operation. Enforces
 * segregation of duties (the requester cannot approve their own request).
 */
export interface ApprovalRequest {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "APR-ab12cd". */
  approvalId: string;
  tenantId: string;
  resourceType: ApprovalResourceType;
  resourceId: string;
  resourceName?: string;
  requesterId: string;
  requesterEmail: string;
  /** Integer minor units of the amount at risk. */
  amountMinor: number;
  currency: string;
  /** Threshold (minor units) that triggered this approval. */
  thresholdMinor: number;
  status: ApprovalStatus;
  approverId?: string;
  approverEmail?: string;
  /** Optional reason supplied on reject. */
  rejectionReason?: string;
  /** Optional structured metadata (e.g. payment method, reference). */
  metadata?: Record<string, unknown>;
  paymentMethod?: PaymentMethod;
  createdAt: string;
  updatedAt: string;
}
