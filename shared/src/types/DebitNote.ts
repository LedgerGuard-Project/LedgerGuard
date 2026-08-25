import type { ObjectId } from './primitives';
import type { NoteStatus } from './CreditNote';

/**
 * A debit note — a positive charge added to a customer's account, always
 * linked to a source invoice. Increases the receivable and adds revenue.
 */
export interface DebitNote {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "DBN-ab12cd". */
  debitNoteId: string;
  tenantId: string;
  /** Source invoice being debited. */
  invoiceId: string;
  invoiceNumber?: string;
  customerId: string;
  customerName?: string;
  debitNoteNumber: string;
  status: NoteStatus;
  /** Free-form reason for the adjustment. */
  reason?: string;
  currency: string;
  /** Additional charge amount in minor units (adds to what is owed). */
  amountMinor: number;
  /** Snapshot of the tax rate applied (percent) at issuance. */
  taxRateMinor?: number;
  /** Tax amount in minor units to add. */
  taxAmountMinor?: number;
  /** Total minor units added (amount + tax). */
  totalMinor: number;
  issuedAt?: string;
  createdAt: string;
  updatedAt: string;
}
