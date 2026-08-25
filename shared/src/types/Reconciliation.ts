/**
 * Reconciliation primitives.
 *
 * Reconciliation re-derives the expected state of the billing ledger from its
 * source-of-truth aggregates (LedgerTransaction / LedgerEntry / BillingAccount
 * / Invoice) and reports — or, in `repair` mode, corrects — any discrepancies
 * found. Runs are idempotent (Idempotency-Key guarded) and guarded by a
 * distributed lock so the same key can never drive two concurrent rechecks.
 */

export const RECONCILIATION_STATUSES = [
  'clean',
  'unclean',
  'discrepancies',
  'repaired',
  'failed',
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

/** The four ledger invariants checked by a reconciliation run. */
export const RECONCILIATION_CHECK_TYPES = [
  'unbalanced_entries',
  'orphan_entries',
  'account_balance',
  'invoice_settlement',
] as const;
export type ReconciliationCheckType = (typeof RECONCILIATION_CHECK_TYPES)[number];

export const RECONCILIATION_ENTITY_TYPES = [
  'transaction',
  'entry',
  'account',
  'invoice',
] as const;
export type ReconciliationEntityType = (typeof RECONCILIATION_ENTITY_TYPES)[number];

export interface ReconciliationDiscrepancy {
  check: ReconciliationCheckType;
  /** 'error' blocks `clean`; 'warning' does not (informational only). */
  severity: 'error' | 'warning';
  entityType: ReconciliationEntityType;
  /** The transactionId / entryId / accountId / invoiceId that diverged. */
  entityId: string;
  message: string;
  /** Integer minor units the ledger SHOULD reflect. */
  expectedMinor?: number;
  /** Integer minor units the ledger currently reflects. */
  actualMinor?: number;
  /** True when `repair` mode corrected this entity. */
  repaired?: boolean;
}

export interface ReconciliationRun {
  id: string;
  /** Stable per-tenant key, e.g. "REC-9f2k41". */
  reconciliationId: string;
  tenantId: string;
  status: ReconciliationStatus;
  checkedAt: string;
  repairRequested: boolean;
  /** True when at least one discrepancy was actually repaired. */
  repairApplied: boolean;
  totalChecks: number;
  discrepancyCount: number;
  repairedCount: number;
  /** Currency scope of the run (tenant's dominant account currency), if any. */
  currency?: string;
  discrepancies: ReconciliationDiscrepancy[];
}