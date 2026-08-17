import type { ObjectId } from './primitives';

/**
 * A single line in a double-entry ledger posting. Debits and credits must
 * balance per posting group (sum(debits) === sum(credits)).
 */
export interface LedgerEntry {
  id: ObjectId;
  transactionId: ObjectId;
  accountId: ObjectId;
  /** positive for debit, negative for credit (or use convention flags) */
  amount: number;
  debit: boolean;
  credit: boolean;
  recordedAt: string;
}

export interface LedgerPosting {
  transactionId: ObjectId;
  entries: Array<Pick<LedgerEntry, 'accountId' | 'amount' | 'debit' | 'credit'>>;
}