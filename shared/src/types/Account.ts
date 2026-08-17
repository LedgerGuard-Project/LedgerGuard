import type { Amount, CurrencyCode, ObjectId } from './primitives';

export enum AccountType {
  Asset = 'asset',
  Liability = 'liability',
  Equity = 'equity',
  Revenue = 'revenue',
  Expense = 'expense',
}

export interface Account {
  id: ObjectId;
  userId: ObjectId;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  /** current balance in smallest currency unit */
  balance: Amount;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSummary {
  id: ObjectId;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  balance: Amount;
}