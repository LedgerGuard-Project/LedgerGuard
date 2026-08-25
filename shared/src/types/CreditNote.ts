import type { ObjectId } from './primitives';

/** Lifecycle of a credit/debit note. */
export const NOTE_STATUSES = ['draft', 'issued', 'cancelled'] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

/**
 * A credit note — a negative adjustment to a customer's account, always
 * linked to a source invoice. Reduces the receivable and reverses revenue.
 */
export interface CreditNote {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "CRN-ab12cd". */
  creditNoteId: string;
  tenantId: string;
  /** Source invoice being credited. */
  invoiceId: string;
  invoiceNumber?: string;
  customerId: string;
  customerName?: string;
  creditNoteNumber: string;
  status: NoteStatus;
  /** Free-form reason for the adjustment. */
  reason?: string;
  currency: string;
  /** Credit amount in minor units (reduces what is owed). */
  amountMinor: number;
  /** Snapshot of the tax rate applied (percent) at issuance. */
  taxRateMinor?: number;
  /** Tax amount in minor units (reversed revenue tax). */
  taxAmountMinor?: number;
  /** Total minor units reversed (amount + tax). */
  totalMinor: number;
  issuedAt?: string;
  createdAt: string;
  updatedAt: string;
}
