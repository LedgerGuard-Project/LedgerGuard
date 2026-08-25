import type { ObjectId } from './primitives';

/** Lifecycle states of an imported bank transaction during reconciliation. */
export const BANK_TRANSACTION_STATUSES = [
  'unmatched',
  'matched',
  'mismatch',
  'manually_matched',
  'ignored',
] as const;
export type BankTransactionStatus = (typeof BANK_TRANSACTION_STATUSES)[number];

/** How a bank transaction was matched to a ledger transaction. */
export const BANK_MATCH_CONFIDENCE = ['auto', 'manual'] as const;
export type BankMatchConfidence = (typeof BANK_MATCH_CONFIDENCE)[number];

/**
 * A row of bank/statement data imported for reconciliation. It is compared
 * against the tenant's LedgerTransactions and either matched automatically
 * (by reference or amount+date) or resolved manually.
 */
export interface BankTransaction {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "BNK-7f2k91". */
  bankTransactionId: string;
  tenantId: string;
  /** Import batch this row belongs to. */
  batchId: string;
  /** External statement reference used for automatic matching. */
  externalReference?: string;
  description?: string;
  /** Integer minor units, e.g. 10000 = $100.00. */
  amountMinor: number;
  currency: string;
  /** Statement transaction date (ISO). */
  transactionDate: string;
  /** The LedgerTransaction this row matched to, if any. */
  ledgerTransactionId?: string;
  status: BankTransactionStatus;
  matchConfidence?: BankMatchConfidence;
  notes?: string;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankTransactionSummary {
  id: ObjectId;
  bankTransactionId: string;
  externalReference?: string;
  description?: string;
  amountMinor: number;
  currency: string;
  transactionDate: string;
  ledgerTransactionId?: string;
  status: BankTransactionStatus;
  matchConfidence?: BankMatchConfidence;
  notes?: string;
}

/** Aggregated view shown on the reconciliation dashboard. */
export interface ReconciliationDashboard {
  totalBankTransactions: number;
  matchedCount: number;
  unmatchedCount: number;
  mismatchCount: number;
  manuallyMatchedCount: number;
  ignoredCount: number;
  /** Sum of amounts for rows in matched/manually_matched state. */
  totalReconciledMinor: number;
  /** Sum of amounts for rows still unmatched/mismatch. */
  totalUnreconciledMinor: number;
  latestBatchId?: string;
}

export interface ImportSummary {
  imported: number;
  matchedAutomatically: number;
  batchId: string;
}