import type { ObjectId } from './primitives';

export const TRANSACTION_TYPES = ['charge', 'refund', 'credit', 'debit', 'adjustment'] as const;
export type LedgerTransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'rolled_back',
] as const;
export type LedgerTransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PAYMENT_METHODS = ['card', 'bank_transfer', 'cash', 'check', 'manual'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** One financial operation recorded against a customer. All fields tenant-scoped. */
export interface LedgerTransaction {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "TXN-ab12cd". */
  transactionId: string;
  tenantId: string;
  /** References the owning Customer.customerId string key. */
  customerId: string;
  /** References the owning BillingAccount.accountId string key. */
  accountId: string;
  /** Optional invoice being settled. */
  invoiceId?: string;
  /** Integer minor units, e.g. 10000 = $100.00. */
  amountMinor: number;
  /** Major-unit decimal view (amountMinor / 100). */
  amount: number;
  currency: string;
  type: LedgerTransactionType;
  status: LedgerTransactionStatus;
  /** Client-supplied or auto-generated deduplication key. */
  idempotencyKey?: string;
  reference?: string;
  description?: string;
  paymentMethod?: PaymentMethod;
  /** Human-readable reason persisted when a payment/refund fails. */
  failureReason?: string;
  /** Number of times this failed transaction has been retried. */
  retryCount: number;
  /** When the most recent retry attempt happened. */
  lastRetryAt?: string;
  metadata?: Record<string, unknown>;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerTransactionSummary {
  transactionId: string;
  customerId: string;
  customerName?: string;
  amountMinor: number;
  amount: number;
  currency: string;
  type: LedgerTransactionType;
  status: LedgerTransactionStatus;
  reference?: string;
  paymentMethod?: PaymentMethod;
  createdAt: string;
}