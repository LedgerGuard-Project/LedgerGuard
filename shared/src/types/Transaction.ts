import type { Amount, CurrencyCode, ObjectId } from './primitives';
import type { Account } from './Account';

export enum TransactionType {
  Income = 'income',
  Expense = 'expense',
  Transfer = 'transfer',
}

export interface Transaction {
  id: ObjectId;
  userId: ObjectId;
  type: TransactionType;
  accountId: ObjectId;
  /** optional counterpart account for transfers */
  toAccountId?: ObjectId;
  categoryId?: ObjectId;
  amount: Amount;
  currency: CurrencyCode;
  note?: string;
  /** ISO date-time when the transaction was recorded */
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionWithMeta extends Transaction {
  account?: Account;
  toAccount?: Account;
}