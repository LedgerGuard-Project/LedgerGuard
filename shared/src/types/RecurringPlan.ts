import type { ObjectId } from './primitives';
import type { PaymentMethod } from './LedgerTransaction';

/** Billing cadence for a recurring plan. */
export const RECURRING_INTERVALS = ['monthly', 'quarterly', 'yearly', 'custom'] as const;
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];

/** Lifecycle of a recurring plan. */
export const RECURRING_STATUSES = ['active', 'paused', 'cancelled'] as const;
export type RecurringStatus = (typeof RECURRING_STATUSES)[number];

/** Status an invoice generated from a recurring plan starts in. */
export const RECURRING_INVOICE_STATUSES = ['draft', 'issued'] as const;
export type RecurringInvoiceStatus = (typeof RECURRING_INVOICE_STATUSES)[number];

/**
 * A customer agreement to bill on a fixed cadence. Drives automatic invoice
 * generation. All fields are tenant-scoped; `nextBillingDate` advances by
 * `intervalCount * interval` each cycle.
 */
export interface RecurringPlan {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "RPL-ab12cd". */
  planId: string;
  tenantId: string;
  /** References the owning Customer.customerId string key. */
  customerId: string;
  customerName?: string;
  name: string;
  description?: string;
  /** Integer minor units, e.g. 10000 = $100.00. */
  amountMinor: number;
  currency: string;
  interval: RecurringInterval;
  /** Multiplier on the interval (e.g. every 2 months). Defaults to 1. */
  intervalCount: number;
  /** First billing cycle starts on/after this date. */
  startDate: string;
  /** Date the next invoice will be generated. */
  nextBillingDate: string;
  /** Optional end of the plan (after this date no invoices generate). */
  endDate?: string;
  status: RecurringStatus;
  /** Status a generated invoice takes. */
  invoiceStatus: RecurringInvoiceStatus;
  paymentMethod?: PaymentMethod;
  /** When true the background sweep auto-generates invoices for due plans. */
  autoGenerate: boolean;
  /** Date of the last generated invoice (used for duplicate prevention). */
  lastGeneratedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Preview of the next invoice a plan would generate (no mutation). */
export interface RecurringInvoicePreview {
  planId: string;
  invoiceNumber: string;
  amount: number;
  amountMinor: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  items: Array<{ description: string; quantity: number; unitPriceMinor: number; amountMinor: number }>;
}