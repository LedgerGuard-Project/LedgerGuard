import type { ObjectId } from './primitives';

export const LEDGER_DIRECTIONS = ['debit', 'credit'] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

export const LEDGER_ENTRY_TYPES = [
  'customer_account',
  'revenue_account',
  'asset',
  'liability',
  'equity',
  'expense',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

/**
 * A single line in a double-entry posting. Every transaction writes a balanced
 * group of entries: sum(debit amounts) === sum(credit amounts).
 */
export interface LedgerEntry {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "ENT-ab12cd". */
  entryId: string;
  tenantId: string;
  /** References the originating LedgerTransaction.transactionId. */
  transactionId: string;
  /** References the BillingAccount.accountId this line posts to. */
  accountId: string;
  entryType: LedgerEntryType;
  /** Integer minor units (e.g. cents for USD). Always positive. */
  amountMinor: number;
  currency: string;
  direction: LedgerDirection;
  description: string;
  createdAt: string;
}

export interface LedgerPostingGroup {
  transactionId: string;
  currency: string;
  entries: Array<{
    accountId: string;
    entryType: LedgerEntryType;
    amountMinor: number;
    direction: LedgerDirection;
    description: string;
  }>;
}