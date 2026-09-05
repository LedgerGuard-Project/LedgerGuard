import type { ObjectId } from './primitives';

/**
 * A compliance evidence package: an immutable snapshot of audit records plus
 * the related financial documents, signed with a content hash.
 */
export interface ComplianceEvidence {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "EVD-ab12cd34". */
  evidenceId: string;
  tenantId: string;
  name: string;
  /** Date-range filter used to select the audit records. */
  rangeFrom: string;
  rangeTo: string;
  filters: Array<{ field: string; value: string }>;
  /** Snapshot of AuditLog entries included in this package. */
  auditRecords: Array<{
    id: string;
    action: string;
    resource: string;
    resourceId?: string;
    actorEmail?: string;
    createdAt: string;
    details?: Record<string, unknown>;
  }>;
  /** Resource-ids collected across filters (invoices/payments/ledger etc.). */
  relatedResourceIds: Record<string, string[]>;
  generatedBy: { id: string; email: string };
  contentHash: string;
  createdAt: string;
}